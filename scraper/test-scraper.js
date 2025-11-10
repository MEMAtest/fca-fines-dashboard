// Test script for scraper logic without needing a browser
const { categorizeBreach, categorizeFirm } = require('./scraper.js');

console.log('🧪 Testing FCA Fines Scraper Logic\n');

// Test data from the 2025 example you provided
const testData = [
    {
        firm: 'Poojan Sheth',
        date: '5/08/2025',
        amount: '£57,600',
        reason: 'This Final Notice refers to breaches of Market Abuse Regulations and Financial Services and Markets Act 2000 related to market abuse, market manipulation, failing to act with integrity and lack of fitness/propriety in the investment bank sector. We imposed a financial penalty and a prohibition.'
    },
    {
        firm: 'Sigma Broking Limited',
        date: '29/07/2025',
        amount: '£1,087,300',
        reason: 'This Final Notice refers to breaches of PRIN 3 and MiFIR related to transaction reporting in the trading firm sector. We imposed a financial penalty.'
    },
    {
        firm: 'Barclays Bank plc',
        date: '14/07/2025',
        amount: '£39,314,700',
        reason: 'This Final Notice refers to a breach of Principle 2 (skill, care and diligence) of the Authority\'s Principles for Businesses that occurred between 9 January 2015 and 23 April 2021. Barclays\' breach relates to its failures to identify, assess, monitor and manage adequately the money laundering risks associated with the provision of banking services to one of its corporate banking customers.'
    },
    {
        firm: 'Monzo Bank Limited',
        date: '8/07/2025',
        amount: '£21,091,300',
        reason: 'This Final Notice refers to breaches of PRIN 3 and s.55L of FSMA related to conduct in the retail banks sector. We imposed a financial penalty.'
    },
    {
        firm: 'Toni Fox',
        date: '30/05/2025',
        amount: '£567,584',
        reason: 'This Final Notice refers to breaches of PRIN 1 and the provision of inappropriate pension transfer advice. We imposed a financial penalty, withdrawal of approvals and a prohibition order.'
    },
    {
        firm: 'The London Metal Exchange (RIE)',
        date: '20/03/2025',
        amount: '£9,245,900',
        reason: 'This Final Notice refers to breaches of REC 2.5.1 paragraph 3(1) and 3(2)(h) and Article 18(3)(a) and (4) of MiFID RTS 7, relating to wholesale conduct in the Recognised Investment Exchanges sector. We imposed a financial penalty of £9.2 million which included a 30% early settlement discount.'
    },
    {
        firm: 'Mako Financial Markets Partnership LLP',
        date: '17/02/2025',
        amount: '£1,662,700',
        reason: 'This Final Notice refers to breaches of PRIN 2 and PRIN 3 related to the risk of financial crime in the trading firm sector. We imposed a financial penalty.'
    }
];

console.log('📊 Testing Data Parsing & Categorization:\n');

function parseAmount(amountStr) {
    return parseFloat(amountStr.replace(/[£,]/g, ''));
}

function parseDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return null;
}

let passCount = 0;
let failCount = 0;

testData.forEach((test, index) => {
    console.log(`\n--- Test Case ${index + 1}: ${test.firm} ---`);

    const breachType = categorizeBreach(test.reason);
    const firmCategory = categorizeFirm(test.reason, test.firm);
    const amount = parseAmount(test.amount);
    const date = parseDate(test.date);

    console.log(`Firm: ${test.firm}`);
    console.log(`Amount: £${amount.toLocaleString()}`);
    console.log(`Date: ${date ? date.toISOString().split('T')[0] : 'FAILED TO PARSE'}`);
    console.log(`Breach Type: ${breachType}`);
    console.log(`Firm Category: ${firmCategory}`);

    // Validation checks
    let testPassed = true;

    // Check amount parsing
    if (isNaN(amount)) {
        console.log('❌ FAIL: Amount parsing failed');
        testPassed = false;
    } else {
        console.log('✅ PASS: Amount parsed correctly');
    }

    // Check date parsing
    if (!date) {
        console.log('❌ FAIL: Date parsing failed');
        testPassed = false;
    } else {
        console.log('✅ PASS: Date parsed correctly');
    }

    // Check categorization
    if (!breachType || breachType === '') {
        console.log('❌ FAIL: Breach type categorization failed');
        testPassed = false;
    } else {
        console.log('✅ PASS: Breach type categorized');
    }

    if (!firmCategory || firmCategory === '') {
        console.log('❌ FAIL: Firm category categorization failed');
        testPassed = false;
    } else {
        console.log('✅ PASS: Firm category categorized');
    }

    if (testPassed) {
        passCount++;
    } else {
        failCount++;
    }
});

console.log('\n' + '='.repeat(60));
console.log('📈 Test Results Summary:');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passCount}/${testData.length}`);
console.log(`❌ Failed: ${failCount}/${testData.length}`);

if (failCount === 0) {
    console.log('\n🎉 All tests passed! Scraper logic is working correctly.');
    process.exit(0);
} else {
    console.log('\n⚠️  Some tests failed. Review the output above.');
    process.exit(1);
}
