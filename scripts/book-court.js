const { chromium } = require('playwright');

// Configuration from environment
const CONFIG = {
  baseUrl: 'https://my.tfc.com',
  amenitiesUrl: 'https://my.tfc.com/amenities',
  username: process.env.TFC_USERNAME,
  password: process.env.TFC_PASSWORD,
  targetDate: process.env.TARGET_DATE, // YYYY-MM-DD
  targetTime: process.env.TARGET_TIME, // HH:MM (24hr)
  ntfyTopic: process.env.NTFY_TOPIC,
  navigationTimeout: 30000,
  actionTimeout: 10000,
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function notify(message) {
  if (!CONFIG.ntfyTopic) return;
  try {
    await fetch(`https://ntfy.sh/${CONFIG.ntfyTopic}`, {
      method: 'POST',
      body: message,
    });
  } catch (e) {
    log(`Failed to send notification: ${e.message}`, 'error');
  }
}

async function performLogin(page) {
  const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email'];
  const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];

  let usernameInput = null;
  for (const selector of usernameSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      usernameInput = page.locator(selector);
      break;
    }
  }

  let passwordInput = null;
  for (const selector of passwordSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      passwordInput = page.locator(selector);
      break;
    }
  }

  if (!usernameInput || !passwordInput) {
    throw new Error('Could not find login fields');
  }

  await usernameInput.fill(CONFIG.username);
  await passwordInput.fill(CONFIG.password);

  const loginButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');
  await loginButton.first().click();
  await page.waitForLoadState('networkidle');

  await page.waitForTimeout(2000);
  if (page.url().includes('login')) {
    throw new Error('Login failed - still on login page');
  }

  log('Login successful');
}

async function selectTimeSlot(page, targetTime) {
  const targetHour = targetTime.getHours();
  const targetMinute = targetTime.getMinutes();
  const isPM = targetHour >= 12;
  const displayHour = targetHour > 12 ? targetHour - 12 : (targetHour === 0 ? 12 : targetHour);
  const displayMinute = targetMinute.toString().padStart(2, '0');
  const targetTimeStr = `${displayHour}:${displayMinute} ${isPM ? 'pm' : 'am'}`;

  log(`Looking for time slot: ${targetTimeStr}`);

  await page.waitForSelector('table, .start-time-block', { timeout: CONFIG.actionTimeout });
  await page.waitForTimeout(1000);

  const timeRows = await page.locator('tr').all();

  for (const row of timeRows) {
    const rowText = await row.textContent() || '';

    if (rowText.toLowerCase().includes(targetTimeStr.toLowerCase())) {
      log(`Found time row: ${targetTimeStr}`);

      const openSlots = await row.locator('td.start-time-block.open button, td.open button').all();

      if (openSlots.length === 0) {
        log(`No open slots for ${targetTimeStr}`, 'error');
        return {
          success: false,
          message: `No courts available at ${targetTimeStr} - both booked`
        };
      }

      // Prefer Court 2 (last column) if both are open
      const slotToClick = openSlots[openSlots.length - 1];
      const courtName = openSlots.length >= 2 ? 'Tennis Court 2' : 'Tennis Court 1';

      log(`Selecting ${courtName}...`);
      await slotToClick.click();
      await page.waitForLoadState('networkidle');

      return {
        success: true,
        message: `Selected ${courtName} at ${targetTimeStr}`,
        courtBooked: courtName,
        timeBooked: targetTimeStr
      };
    }
  }

  // Alternative approach
  log('Trying alternative slot selection method...');

  const allOpenSlots = await page.locator('.start-time-block.open').all();

  for (const slot of allOpenSlots) {
    const row = slot.locator('xpath=ancestor::tr');
    const rowText = await row.textContent() || '';

    if (rowText.toLowerCase().includes(targetTimeStr.toLowerCase())) {
      const rowOpenSlots = await row.locator('.start-time-block.open').all();
      const slotToClick = rowOpenSlots[rowOpenSlots.length - 1];
      const button = slotToClick.locator('button');

      const courtName = rowOpenSlots.length >= 2 ? 'Tennis Court 2' : 'Tennis Court 1';
      log(`Selecting ${courtName}...`);

      await button.click();
      await page.waitForLoadState('networkidle');

      return {
        success: true,
        message: `Selected ${courtName} at ${targetTimeStr}`,
        courtBooked: courtName,
        timeBooked: targetTimeStr
      };
    }
  }

  return {
    success: false,
    message: `Could not find time slot for ${targetTimeStr}`
  };
}

async function configureReservation(page) {
  await page.waitForURL('**/confirm**', { timeout: CONFIG.navigationTimeout });
  await page.waitForTimeout(1000);

  // Select 60-min duration (later end time)
  const endTimeButtons = await page.locator('button.btn-simple').all();

  if (endTimeButtons.length >= 2) {
    log('Selecting 60-minute reservation...');
    await endTimeButtons[1].click();
  } else if (endTimeButtons.length === 1) {
    await endTimeButtons[0].click();
  }

  // Select 1 guest
  log('Setting 1 additional guest...');
  const guestSelect = page.locator('select#guests, select[name="guests"]');
  if (await guestSelect.count() > 0) {
    await guestSelect.selectOption('1');
  }

  await page.waitForTimeout(500);
}

async function runBooking() {
  // Validate config
  if (!CONFIG.username || !CONFIG.password) {
    throw new Error('Missing TFC_USERNAME or TFC_PASSWORD environment variables');
  }
  if (!CONFIG.targetDate || !CONFIG.targetTime) {
    throw new Error('Missing TARGET_DATE or TARGET_TIME environment variables');
  }

  // Parse target datetime
  const [year, month, day] = CONFIG.targetDate.split('-').map(Number);
  const [hour, minute] = CONFIG.targetTime.split(':').map(Number);
  const targetTime = new Date(year, month - 1, day, hour, minute);

  log(`Target reservation: ${targetTime.toLocaleString()}`);

  let browser = null;

  try {
    log('Starting tennis court reservation...');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(CONFIG.actionTimeout);

    // Step 1: Navigate to amenities
    log('Navigating to amenities page...');
    await page.goto(CONFIG.amenitiesUrl, {
      waitUntil: 'networkidle',
      timeout: CONFIG.navigationTimeout
    });

    // Step 2: Login if needed
    if (page.url().includes('login') || await page.locator('input[type="password"]').count() > 0) {
      log('Login required, entering credentials...');
      await performLogin(page);

      await page.goto(CONFIG.amenitiesUrl, {
        waitUntil: 'networkidle',
        timeout: CONFIG.navigationTimeout
      });
    }

    // Step 3: Click Tennis Court tile
    log('Selecting Tennis Court...');
    const tennisTile = page.locator('button.amenity-tile:has-text("Tennis Court")');
    await tennisTile.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout });
    await tennisTile.click();
    await page.waitForLoadState('networkidle');

    // Step 4: Accept rules
    log('Accepting rules...');
    const acceptButton = page.locator('button.btn-primary:has-text("I accept")');
    await acceptButton.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout });
    await acceptButton.click();
    await page.waitForLoadState('networkidle');

    // Step 5: Select time slot
    log('Selecting time slot...');
    const slotResult = await selectTimeSlot(page, targetTime);

    if (!slotResult.success) {
      await browser.close();
      throw new Error(slotResult.message);
    }

    // Step 6: Configure reservation
    log('Configuring reservation...');
    await configureReservation(page);

    // Step 7: Submit
    log('Submitting reservation...');
    const submitButton = page.locator('button.btn-primary:has-text("Submit reservation")');
    await submitButton.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout });
    await submitButton.click();
    await page.waitForLoadState('networkidle');

    // Step 8: Verify success
    await page.waitForTimeout(2000);
    const pageContent = await page.content();

    const hasConfirmation = pageContent.toLowerCase().includes('confirmed') ||
                           pageContent.toLowerCase().includes('success') ||
                           (pageContent.toLowerCase().includes('reservation') && !pageContent.toLowerCase().includes('error'));

    await browser.close();

    if (hasConfirmation || page.url().includes('success') || page.url().includes('confirmed')) {
      const successMsg = `Successfully booked ${slotResult.courtBooked} at ${slotResult.timeBooked}!`;
      log(successMsg, 'success');
      await notify(successMsg);
      return { success: true, message: successMsg };
    } else {
      throw new Error('Reservation may have failed - please verify manually');
    }

  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    const message = error.message || 'Unknown error';
    log(`Error: ${message}`, 'error');
    await notify(`Booking failed: ${message}`);
    throw error;
  }
}

// Run the booking
runBooking()
  .then(result => {
    console.log('Booking completed:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Booking failed:', error.message);
    process.exit(1);
  });
