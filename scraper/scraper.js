require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jypcwaskqihgnnasawie.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5cGN3YXNrcWloZ25uYXNhd2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4OTkxOTcsImV4cCI6MjA2NDQ3NTE5N30.wl3g5eOASYSw52IA2jnQo7DMDtiT8BW9waj-kZJpVDE';
const START_YEAR = 2013;
const CURRENT_YEAR = new Date().getFullYear();

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Categorization logic based on keywords in the reason field
function categorizeBreach(reason) {
    const reasonLower = reason.toLowerCase();

    // Breach type categorization
    if (reasonLower.includes('market abuse') || reasonLower.includes('market manipulation')) {
        return 'Market Abuse';
    } else if (reasonLower.includes('money laundering') || reasonLower.includes('financial crime')) {
        return 'Financial Crime';
    } else if (reasonLower.includes('transaction reporting') || reasonLower.includes('mifir')) {
        return 'Transaction Reporting';
    } else if (reasonLower.includes('pension transfer')) {
        return 'Pension Transfer Advice';
    } else if (reasonLower.includes('integrity') || reasonLower.includes('conduct rule')) {
        return 'Conduct & Integrity';
    } else if (reasonLower.includes('listing rule')) {
        return 'Listing Rules';
    } else if (reasonLower.includes('client money') || reasonLower.includes('account opening')) {
        return 'Client Money & Assets';
    } else if (reasonLower.includes('risk management') || reasonLower.includes('sysc')) {
        return 'Systems & Controls';
    } else {
        return 'Other Regulatory Breach';
    }
}

function categorizeFirm(reason, firmName) {
    const reasonLower = reason.toLowerCase();
    const firmLower = firmName.toLowerCase();

    // First check for definite corporate indicators
    const corporateIndicators = [
        'ltd', 'limited', 'plc', 'llp', 'inc', 'corp', 'corporation',
        'partnership', 'bank', 'exchange', 'group', 'holdings',
        'capital', 'markets', 'securities', 'financial', 'advisors',
        'international', 'global', 'company', 'companies', 'trust',
        'management', 'services', 'asset', 'investments'
    ];

    const isCorporate = corporateIndicators.some(indicator =>
        firmLower.includes(indicator)
    );

    // Firm categorization based on keywords (do this first if corporate)
    if (isCorporate || firmName.split(' ').length > 4) {
        // It's definitely a company, now categorize the type
        if (reasonLower.includes('investment bank')) {
            return 'Investment Banking';
        } else if (firmLower.includes('bank') || reasonLower.includes('banking')) {
            return 'Banking';
        } else if (firmLower.includes('asset') || reasonLower.includes('asset management')) {
            return 'Asset Management';
        } else if (reasonLower.includes('trading firm') || firmLower.includes('trading')) {
            return 'Trading Firm';
        } else if (firmLower.includes('insurance')) {
            return 'Insurance';
        } else if (reasonLower.includes('exchange') || firmLower.includes('exchange')) {
            return 'Exchange';
        } else if (reasonLower.includes('mortgage') || reasonLower.includes('pension')) {
            return 'Financial Planning';
        } else {
            return 'Corporate';
        }
    }

    // Check if it's an individual (refined patterns)
    // Individual names typically have 2-4 words and follow name patterns
    // Allows hyphens in names (e.g., Jean-Noel) where each part starts with capital
    const wordCount = firmName.split(' ').length;
    const hasNamePattern = /^([A-Z][a-z]+(-[A-Z][a-z]+)*)(\s+[A-Z][a-z]+(-[A-Z][a-z]+)*)*$/.test(firmName);

    if (wordCount >= 2 && wordCount <= 4 && hasNamePattern) {
        return 'Individual';
    }

    // If we can't determine, check reason for sector clues
    if (reasonLower.includes('investment bank')) {
        return 'Investment Banking';
    } else if (reasonLower.includes('banking')) {
        return 'Banking';
    } else if (reasonLower.includes('asset management')) {
        return 'Asset Management';
    } else if (reasonLower.includes('trading firm')) {
        return 'Trading Firm';
    } else if (reasonLower.includes('insurance')) {
        return 'Insurance';
    } else if (reasonLower.includes('exchange')) {
        return 'Exchange';
    } else if (reasonLower.includes('mortgage') || reasonLower.includes('pension')) {
        return 'Financial Planning';
    }

    // Default to Corporate if uncertain
    return 'Corporate';
}

function parseAmount(amountStr) {
    // Remove £ and commas, then parse
    return parseFloat(amountStr.replace(/[£,]/g, ''));
}

function parseDate(dateStr) {
    // Format is DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return null;
}

async function scrapeFinesForYear(year, browser) {
    const url = `https://www.fca.org.uk/news/news-stories/${year}-fines`;
    console.log(`\n📥 Scraping ${year} fines from: ${url}`);

    const page = await browser.newPage();

    try {
        // Set user agent to mimic real browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to the page
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for the table to load
        await page.waitForSelector('table', { timeout: 10000 });

        // Extract table data
        const fines = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));

            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    return {
                        firm: cells[0].textContent.trim(),
                        date: cells[1].textContent.trim(),
                        amount: cells[2].textContent.trim(),
                        reason: cells[3].textContent.trim()
                    };
                }
                return null;
            }).filter(item => item !== null);
        });

        console.log(`✅ Found ${fines.length} fines for ${year}`);

        // Process and categorize the data
        const processedFines = fines.map(fine => {
            const date = parseDate(fine.date);

            return {
                firm_individual: fine.firm,
                date_issued: date ? date.toISOString().split('T')[0] : null,
                year_issued: date ? date.getFullYear() : year,
                month_issued: date ? date.getMonth() + 1 : null,
                amount: parseAmount(fine.amount),
                summary: fine.reason,
                regulator: 'FCA',
                breach_type: categorizeBreach(fine.reason),
                firm_category: categorizeFirm(fine.reason, fine.firm)
            };
        });

        return processedFines;

    } catch (error) {
        console.error(`❌ Error scraping ${year}:`, error.message);
        return [];
    } finally {
        await page.close();
    }
}

async function insertIntoSupabase(fines, dryRun = false) {
    if (dryRun) {
        console.log('\n🔍 DRY RUN MODE - Sample data (first 3 records):');
        console.log(JSON.stringify(fines.slice(0, 3), null, 2));
        console.log(`\nTotal records to insert: ${fines.length}`);
        return;
    }

    console.log(`\n💾 Inserting ${fines.length} records into Supabase...`);

    try {
        // Clear existing data (optional - you might want to keep historical data)
        // Uncomment the following if you want to clear before inserting:
        // const { error: deleteError } = await supabase
        //     .from('fca_fines')
        //     .delete()
        //     .neq('id', 0);

        // Insert in batches of 100 to avoid hitting limits
        const batchSize = 100;
        let inserted = 0;

        for (let i = 0; i < fines.length; i += batchSize) {
            const batch = fines.slice(i, i + batchSize);

            const { data, error } = await supabase
                .from('fca_fines')
                .upsert(batch, {
                    onConflict: 'firm_individual,date_issued',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error);
            } else {
                inserted += batch.length;
                console.log(`✅ Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
            }
        }

        console.log(`\n🎉 Successfully inserted ${inserted} records!`);

    } catch (error) {
        console.error('❌ Error inserting into Supabase:', error);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const yearArg = args.find(arg => arg.startsWith('--year'));
    const dryRun = args.includes('--dry-run');

    let yearsToScrape = [];

    if (yearArg) {
        const year = yearArg.includes('=') ?
            parseInt(yearArg.split('=')[1]) :
            parseInt(args[args.indexOf(yearArg) + 1]);

        if (year && year >= START_YEAR && year <= CURRENT_YEAR) {
            yearsToScrape = [year];
        } else {
            console.error(`Invalid year: ${year}. Must be between ${START_YEAR} and ${CURRENT_YEAR}`);
            process.exit(1);
        }
    } else {
        // Scrape all years from START_YEAR to CURRENT_YEAR
        for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
            yearsToScrape.push(year);
        }
    }

    console.log('🚀 FCA Fines Scraper Starting...');
    console.log(`📅 Years to scrape: ${yearsToScrape.join(', ')}`);
    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No data will be inserted into database');
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let allFines = [];

    try {
        for (const year of yearsToScrape) {
            const fines = await scrapeFinesForYear(year, browser);
            allFines = allFines.concat(fines);

            // Add a small delay between requests to be respectful
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`\n📊 Total fines scraped: ${allFines.length}`);

        // Insert into Supabase
        await insertIntoSupabase(allFines, dryRun);

    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        await browser.close();
        console.log('\n✅ Scraper finished!');
    }
}

// Run the scraper
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { scrapeFinesForYear, categorizeBreach, categorizeFirm };
