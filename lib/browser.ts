import { chromium, Browser, Page } from 'playwright'
import { store } from './store'

// Configuration
const CONFIG = {
  baseUrl: 'https://my.tfc.com',
  amenitiesUrl: 'https://my.tfc.com/amenities',
  username: 'zweiner1',
  password: 'forlucasandleo1',

  // Timeouts
  navigationTimeout: 30000,
  actionTimeout: 10000,
}

export interface AutomationResult {
  success: boolean
  message: string
  courtBooked?: string
  timeBooked?: string
}

export async function runAutomation(): Promise<AutomationResult> {
  const targetTime = store.getTargetReservationTime()

  if (!targetTime) {
    return { success: false, message: 'No target reservation time set' }
  }

  let browser: Browser | null = null

  try {
    store.addLog('Starting tennis court reservation...', 'info')
    store.addLog(`Target: ${targetTime.toLocaleString()}`, 'info')

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()
    page.setDefaultTimeout(CONFIG.actionTimeout)

    // Step 1: Navigate to amenities page
    store.addLog('Navigating to amenities page...', 'info')
    await page.goto(CONFIG.amenitiesUrl, {
      waitUntil: 'networkidle',
      timeout: CONFIG.navigationTimeout
    })

    // Step 2: Check if we need to login
    if (page.url().includes('login') || await page.locator('input[type="password"]').count() > 0) {
      store.addLog('Login required, entering credentials...', 'info')
      await performLogin(page)

      // Navigate to amenities after login
      await page.goto(CONFIG.amenitiesUrl, {
        waitUntil: 'networkidle',
        timeout: CONFIG.navigationTimeout
      })
    }

    // Step 3: Click on Tennis Court tile
    store.addLog('Selecting Tennis Court...', 'info')
    const tennisTile = page.locator('button.amenity-tile:has-text("Tennis Court")')
    await tennisTile.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout })
    await tennisTile.click()
    await page.waitForLoadState('networkidle')

    // Step 4: Accept rules
    store.addLog('Accepting rules...', 'info')
    const acceptButton = page.locator('button.btn-primary:has-text("I accept")')
    await acceptButton.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout })
    await acceptButton.click()
    await page.waitForLoadState('networkidle')

    // Step 5: Select the time slot
    store.addLog('Selecting time slot...', 'info')
    const slotResult = await selectTimeSlot(page, targetTime)

    if (!slotResult.success) {
      await browser.close()
      return slotResult
    }

    // Step 6: Configure and confirm reservation
    store.addLog('Configuring reservation...', 'info')
    await configureReservation(page)

    // Step 7: Submit reservation
    store.addLog('Submitting reservation...', 'info')
    const submitButton = page.locator('button.btn-primary:has-text("Submit reservation")')
    await submitButton.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout })
    await submitButton.click()
    await page.waitForLoadState('networkidle')

    // Step 8: Verify success
    await page.waitForTimeout(2000) // Wait for any confirmation
    const currentUrl = page.url()
    const pageContent = await page.content()

    // Check for success indicators
    const hasConfirmation = pageContent.toLowerCase().includes('confirmed') ||
                           pageContent.toLowerCase().includes('success') ||
                           pageContent.toLowerCase().includes('reservation') && !pageContent.toLowerCase().includes('error')

    await browser.close()

    if (hasConfirmation || currentUrl.includes('success') || currentUrl.includes('confirmed')) {
      const successMsg = `Successfully booked ${slotResult.courtBooked} at ${slotResult.timeBooked}!`
      store.addLog(successMsg, 'success')
      return {
        success: true,
        message: successMsg,
        courtBooked: slotResult.courtBooked,
        timeBooked: slotResult.timeBooked
      }
    } else {
      return { success: false, message: 'Reservation may have failed - please verify manually' }
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    store.addLog(`Error: ${message}`, 'error')

    if (browser) {
      await browser.close().catch(() => {})
    }

    return { success: false, message: `Automation failed: ${message}` }
  }
}

async function performLogin(page: Page): Promise<void> {
  // Try common login selectors
  const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email']
  const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password']

  let usernameInput = null
  for (const selector of usernameSelectors) {
    const el = page.locator(selector)
    if (await el.count() > 0) {
      usernameInput = el
      break
    }
  }

  let passwordInput = null
  for (const selector of passwordSelectors) {
    const el = page.locator(selector)
    if (await el.count() > 0) {
      passwordInput = el
      break
    }
  }

  if (!usernameInput || !passwordInput) {
    throw new Error('Could not find login fields')
  }

  await usernameInput.fill(CONFIG.username)
  await passwordInput.fill(CONFIG.password)

  // Click login button
  const loginButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
  await loginButton.first().click()
  await page.waitForLoadState('networkidle')

  // Verify login succeeded
  await page.waitForTimeout(2000)
  if (page.url().includes('login')) {
    throw new Error('Login failed - still on login page')
  }

  store.addLog('Login successful', 'info')
}

async function selectTimeSlot(page: Page, targetTime: Date): Promise<AutomationResult> {
  // Format target time for matching (e.g., "7:00 pm")
  const targetHour = targetTime.getHours()
  const targetMinute = targetTime.getMinutes()
  const isPM = targetHour >= 12
  const displayHour = targetHour > 12 ? targetHour - 12 : (targetHour === 0 ? 12 : targetHour)
  const displayMinute = targetMinute.toString().padStart(2, '0')
  const targetTimeStr = `${displayHour}:${displayMinute} ${isPM ? 'pm' : 'am'}`

  store.addLog(`Looking for time slot: ${targetTimeStr}`, 'info')

  // Wait for the time table to load
  await page.waitForSelector('table, .start-time-block', { timeout: CONFIG.actionTimeout })
  await page.waitForTimeout(1000) // Let the table fully render

  // Find all rows in the time table
  // The table structure appears to be: Time | Court 1 | Court 2
  // We need to find the row with our target time, then check Court 2 first, then Court 1

  // Look for the target time row
  const timeRows = await page.locator('tr').all()

  for (const row of timeRows) {
    const rowText = await row.textContent() || ''

    // Check if this row contains our target time
    if (rowText.toLowerCase().includes(targetTimeStr.toLowerCase())) {
      store.addLog(`Found time row: ${targetTimeStr}`, 'info')

      // Get all cells with "open" slots in this row
      const openSlots = await row.locator('td.start-time-block.open button, td.open button').all()

      if (openSlots.length === 0) {
        store.addLog(`No open slots for ${targetTimeStr}`, 'error')
        return {
          success: false,
          message: `No courts available at ${targetTimeStr} - both booked`
        }
      }

      // Prefer Court 2 (second column) if both are open
      // openSlots[0] would be Court 1, openSlots[1] would be Court 2
      let slotToClick = openSlots[openSlots.length - 1] // Last one (Court 2 if available)
      let courtName = openSlots.length >= 2 ? 'Tennis Court 2' : 'Tennis Court 1'

      store.addLog(`Selecting ${courtName}...`, 'info')
      await slotToClick.click()
      await page.waitForLoadState('networkidle')

      return {
        success: true,
        message: `Selected ${courtName} at ${targetTimeStr}`,
        courtBooked: courtName,
        timeBooked: targetTimeStr
      }
    }
  }

  // Alternative approach: look for Open buttons directly
  store.addLog('Trying alternative slot selection method...', 'info')

  // Find all open slots and their associated times
  const allOpenSlots = await page.locator('.start-time-block.open').all()

  for (let i = 0; i < allOpenSlots.length; i++) {
    const slot = allOpenSlots[i]
    const row = slot.locator('xpath=ancestor::tr')
    const rowText = await row.textContent() || ''

    if (rowText.toLowerCase().includes(targetTimeStr.toLowerCase())) {
      // Check if this is Court 2 by seeing if there's another open slot in the same row
      const rowOpenSlots = await row.locator('.start-time-block.open').all()

      // Click the last open slot in the row (preferring Court 2)
      const slotToClick = rowOpenSlots[rowOpenSlots.length - 1]
      const button = slotToClick.locator('button')

      const courtName = rowOpenSlots.length >= 2 ? 'Tennis Court 2' : 'Tennis Court 1'
      store.addLog(`Selecting ${courtName}...`, 'info')

      await button.click()
      await page.waitForLoadState('networkidle')

      return {
        success: true,
        message: `Selected ${courtName} at ${targetTimeStr}`,
        courtBooked: courtName,
        timeBooked: targetTimeStr
      }
    }
  }

  return {
    success: false,
    message: `Could not find time slot for ${targetTimeStr}`
  }
}

async function configureReservation(page: Page): Promise<void> {
  // Wait for the confirmation page to load
  await page.waitForURL('**/confirm**', { timeout: CONFIG.navigationTimeout })
  await page.waitForTimeout(1000)

  // Select end time - choose the later option (60 min)
  // The buttons are like "7:30 pm" and "8:00 pm" - we want the later one
  const endTimeButtons = await page.locator('button.btn-simple').all()

  if (endTimeButtons.length >= 2) {
    // Click the second (later) end time for 60 min reservation
    store.addLog('Selecting 60-minute reservation (later end time)...', 'info')
    await endTimeButtons[1].click()
  } else if (endTimeButtons.length === 1) {
    // Only one option, click it
    await endTimeButtons[0].click()
  }

  // Select 1 guest
  store.addLog('Setting 1 additional guest...', 'info')
  const guestSelect = page.locator('select#guests, select[name="guests"]')
  if (await guestSelect.count() > 0) {
    await guestSelect.selectOption('1')
  }

  await page.waitForTimeout(500)
}

// Retry wrapper that the scheduler will use
export async function runAutomationWithRetry(): Promise<AutomationResult> {
  const result = await runAutomation()

  if (result.success) {
    return result
  }

  // Check if we should retry
  const isBothCourtsTaken = result.message.includes('both booked') || result.message.includes('No courts available')

  if (isBothCourtsTaken) {
    // Both courts taken, no point retrying
    store.addLog('Both courts are booked - stopping retries', 'info')
    return result
  }

  // Other failure - might be timing, network, etc. - worth retrying
  if (store.shouldRetry()) {
    const retryNum = store.incrementRetry()
    store.addLog(`Will retry in 1 minute (attempt ${retryNum}/${store.getState().maxRetries})`, 'info')
    store.setLastRun(false, result.message, false) // Don't clear schedule
    return { ...result, message: `${result.message} - will retry` }
  }

  return result
}
