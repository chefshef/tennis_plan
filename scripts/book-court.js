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

async function selectTimeSlot(page, targetDate, targetTime) {
  // Format the target date as YYYY-MM-DD for matching the section ID
  const year = targetDate.getFullYear();
  const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const day = targetDate.getDate().toString().padStart(2, '0');
  const targetDateStr = `${year}-${month}-${day}`;

  // Format target time for display matching (e.g., "6:30 pm")
  const targetHour = targetTime.getHours();
  const targetMinute = targetTime.getMinutes();
  const isPM = targetHour >= 12;
  const displayHour = targetHour > 12 ? targetHour - 12 : (targetHour === 0 ? 12 : targetHour);
  const displayMinute = targetMinute.toString().padStart(2, '0');
  const targetTimeStr = `${displayHour}:${displayMinute} ${isPM ? 'pm' : 'am'}`;

  log(`Looking for date: ${targetDateStr}, time: ${targetTimeStr}`);

  await page.waitForSelector('.date-section', { timeout: CONFIG.actionTimeout });
  await page.waitForTimeout(1000);

  // Find the date section with matching ID (e.g., id="2026-02-09")
  // Use attribute selector since IDs starting with numbers aren't valid CSS selectors
  const dateSection = page.locator(`.date-section:has(.header-date[id="${targetDateStr}"])`);
  const dateSectionCount = await dateSection.count();

  if (dateSectionCount === 0) {
    log(`Date section not found for ${targetDateStr}`, 'error');

    // Log available dates for debugging
    const availableDates = await page.locator('.header-date').allTextContents();
    log(`Available dates on page: ${availableDates.join(', ')}`);

    return {
      success: false,
      message: `Date ${targetDateStr} not available - may not be within booking window yet`
    };
  }

  log(`Found date section for ${targetDateStr}`);

  // Within the date section, find the time row
  const timeRows = await dateSection.locator('tr.start-time-schedule-row').all();

  for (const row of timeRows) {
    const timeCell = await row.locator('.time-column').textContent() || '';

    if (timeCell.toLowerCase().trim() === targetTimeStr.toLowerCase()) {
      log(`Found time row: ${targetTimeStr}`);

      const openSlots = await row.locator('td.start-time-block.open button').all();

      if (openSlots.length === 0) {
        log(`No open slots for ${targetTimeStr} on ${targetDateStr}`, 'error');
        return {
          success: false,
          message: `No courts available at ${targetTimeStr} on ${targetDateStr} - both booked`
        };
      }

      // Prefer Court 2 (last column) if both are open
      const slotToClick = openSlots[openSlots.length - 1];
      const courtName = openSlots.length >= 2 ? 'Tennis Court 2' : 'Tennis Court 1';

      log(`Selecting ${courtName} for ${targetDateStr} at ${targetTimeStr}...`);
      await slotToClick.click();
      await page.waitForLoadState('networkidle');

      return {
        success: true,
        message: `Selected ${courtName} at ${targetTimeStr} on ${targetDateStr}`,
        courtBooked: courtName,
        timeBooked: targetTimeStr,
        dateBooked: targetDateStr
      };
    }
  }

  // Time not found in date section
  log(`Time ${targetTimeStr} not found in date section ${targetDateStr}`, 'error');

  // Log available times for debugging
  const availableTimes = await dateSection.locator('.time-column').allTextContents();
  log(`Available times for ${targetDateStr}: ${availableTimes.join(', ')}`);

  return {
    success: false,
    message: `Time slot ${targetTimeStr} not found for ${targetDateStr}`
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

  // Parse target date and time
  const [year, month, day] = CONFIG.targetDate.split('-').map(Number);
  const [hour, minute] = CONFIG.targetTime.split(':').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const targetTime = new Date(year, month - 1, day, hour, minute);

  log(`Target reservation: ${CONFIG.targetDate} at ${CONFIG.targetTime}`);

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

    // Step 5: Select date and time slot
    log('Selecting date and time slot...');
    const slotResult = await selectTimeSlot(page, targetDate, targetTime);

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

// Run booking with retries at :00, :01, :02
async function runWithRetries() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 60 * 1000; // 1 minute

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(`Attempt ${attempt}/${MAX_RETRIES}...`);

    try {
      const result = await runBooking();
      console.log('Booking completed:', result);
      return result;
    } catch (error) {
      const message = error.message || 'Unknown error';
      log(`Attempt ${attempt} failed: ${message}`, 'error');

      // Check if it's a "not available yet" type error worth retrying
      const isRetryable = message.includes('not available') ||
                          message.includes('No courts available') ||
                          message.includes('Could not find time slot') ||
                          message.includes('timeout') ||
                          message.includes('Navigation');

      if (attempt < MAX_RETRIES && isRetryable) {
        log(`Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else if (attempt === MAX_RETRIES) {
        await notify(`All ${MAX_RETRIES} booking attempts failed: ${message}`);
        throw error;
      } else {
        // Non-retryable error
        await notify(`Booking failed (non-retryable): ${message}`);
        throw error;
      }
    }
  }
}

runWithRetries()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
