/**
 * Test script - runs the automation with a visible browser
 * Usage: npx ts-node test-script.ts
 *
 * This lets you watch the automation run and see if selectors work correctly.
 */

import { chromium } from 'playwright'

const CONFIG = {
  baseUrl: 'https://my.tfc.com',
  amenitiesUrl: 'https://my.tfc.com/amenities',
  username: 'zweiner1',
  password: 'forlucasandleo1',
}

// Set this to the time you want to test booking
// Use a time that's currently available on the calendar
const TEST_TARGET_TIME = new Date()
TEST_TARGET_TIME.setDate(TEST_TARGET_TIME.getDate() + 7) // 7 days from now
TEST_TARGET_TIME.setHours(20, 0, 0, 0) // 8:00 PM

async function testAutomation() {
  console.log('Starting test automation...')
  console.log(`Target time: ${TEST_TARGET_TIME.toLocaleString()}`)

  const browser = await chromium.launch({
    headless: false, // VISIBLE BROWSER
    slowMo: 500, // Slow down actions so you can see them
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  })

  const page = await context.newPage()
  page.setDefaultTimeout(15000)

  try {
    // Step 1: Navigate to amenities
    console.log('1. Navigating to amenities page...')
    await page.goto(CONFIG.amenitiesUrl, { waitUntil: 'networkidle' })
    console.log(`   Current URL: ${page.url()}`)

    // Step 2: Check if login needed
    if (page.url().includes('login') || await page.locator('input[type="password"]').count() > 0) {
      console.log('2. Login required, entering credentials...')

      // Find and fill username
      const usernameInput = page.locator('input[name="username"], input[name="email"], input[type="email"], #username, #email').first()
      await usernameInput.fill(CONFIG.username)
      console.log('   Entered username')

      // Find and fill password
      const passwordInput = page.locator('input[name="password"], input[type="password"], #password').first()
      await passwordInput.fill(CONFIG.password)
      console.log('   Entered password')

      // Click login
      const loginButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first()
      await loginButton.click()
      await page.waitForLoadState('networkidle')
      console.log(`   After login URL: ${page.url()}`)

      // Navigate back to amenities if needed
      if (!page.url().includes('amenities')) {
        await page.goto(CONFIG.amenitiesUrl, { waitUntil: 'networkidle' })
      }
    }

    // Step 3: Click Tennis Court tile
    console.log('3. Looking for Tennis Court tile...')
    const tennisTile = page.locator('button.amenity-tile:has-text("Tennis Court")')
    const tileCount = await tennisTile.count()
    console.log(`   Found ${tileCount} tennis tile(s)`)

    if (tileCount === 0) {
      // Try alternative selectors
      console.log('   Trying alternative selectors...')
      const altTile = page.locator('button:has-text("Tennis"), .amenity-tile:has-text("Tennis")')
      console.log(`   Alternative found: ${await altTile.count()}`)
      await altTile.first().click()
    } else {
      await tennisTile.click()
    }
    await page.waitForLoadState('networkidle')
    console.log(`   Current URL: ${page.url()}`)

    // Step 4: Accept rules
    console.log('4. Looking for "I accept" button...')
    const acceptButton = page.locator('button.btn-primary:has-text("I accept"), button:has-text("I accept")')
    const acceptCount = await acceptButton.count()
    console.log(`   Found ${acceptCount} accept button(s)`)

    if (acceptCount > 0) {
      await acceptButton.first().click()
      await page.waitForLoadState('networkidle')
      console.log(`   After accept URL: ${page.url()}`)
    }

    // Step 5: Look at the time selection page
    console.log('5. Analyzing time selection page...')
    await page.waitForTimeout(2000)

    // Debug: print page structure
    const tableHtml = await page.locator('table').first().innerHTML().catch(() => 'No table found')
    console.log(`   Table structure preview: ${tableHtml.substring(0, 500)}...`)

    // Find all time rows
    const rows = await page.locator('tr').all()
    console.log(`   Found ${rows.length} rows`)

    // Format target time
    const targetHour = TEST_TARGET_TIME.getHours()
    const isPM = targetHour >= 12
    const displayHour = targetHour > 12 ? targetHour - 12 : (targetHour === 0 ? 12 : targetHour)
    const targetTimeStr = `${displayHour}:00 ${isPM ? 'pm' : 'am'}`
    console.log(`   Looking for time: ${targetTimeStr}`)

    // Look for the target row
    for (const row of rows) {
      const rowText = await row.textContent() || ''
      if (rowText.toLowerCase().includes(targetTimeStr.toLowerCase())) {
        console.log(`   Found matching row: ${rowText.substring(0, 100)}`)

        const openSlots = await row.locator('td.start-time-block.open, td.open, td:has-text("Open")').all()
        console.log(`   Open slots in row: ${openSlots.length}`)

        if (openSlots.length > 0) {
          // Click the last one (prefer Court 2)
          const slot = openSlots[openSlots.length - 1]
          const button = slot.locator('button')
          if (await button.count() > 0) {
            console.log('   Clicking open slot...')
            await button.click()
          } else {
            await slot.click()
          }
          await page.waitForLoadState('networkidle')
        }
        break
      }
    }

    console.log(`6. Current URL after slot selection: ${page.url()}`)

    // Step 6: Check if we're on confirm page
    if (page.url().includes('confirm')) {
      console.log('7. On confirmation page, configuring...')

      // Find end time buttons
      const endTimeButtons = await page.locator('button.btn-simple').all()
      console.log(`   Found ${endTimeButtons.length} end time buttons`)

      if (endTimeButtons.length >= 2) {
        console.log('   Selecting later end time (60 min)...')
        await endTimeButtons[1].click()
      }

      // Select guests
      const guestSelect = page.locator('select#guests, select[name="guests"]')
      if (await guestSelect.count() > 0) {
        console.log('   Selecting 1 guest...')
        await guestSelect.selectOption('1')
      }

      console.log('\n========================================')
      console.log('STOP: Review the page before submitting!')
      console.log('The browser will stay open for 60 seconds.')
      console.log('If everything looks correct, you can manually click Submit.')
      console.log('========================================\n')

      // Don't auto-submit in test mode - let user verify
      await page.waitForTimeout(60000)
    }

  } catch (error) {
    console.error('Error:', error)
    console.log('\nBrowser will stay open for 30 seconds for debugging...')
    await page.waitForTimeout(30000)
  } finally {
    await browser.close()
  }
}

testAutomation().catch(console.error)
