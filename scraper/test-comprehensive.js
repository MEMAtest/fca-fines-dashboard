// Comprehensive test suite for FCA Fines Scraper
const { categorizeBreach, categorizeFirm } = require('./scraper.js');

console.log('🧪 Comprehensive FCA Fines Scraper Test Suite\n');

// Test functions
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

// Test Suite 1: Amount Parsing
console.log('='.repeat(60));
console.log('Test Suite 1: Amount Parsing');
console.log('='.repeat(60));

const amountTests = [
    { input: '£57,600', expected: 57600 },
    { input: '£1,087,300', expected: 1087300 },
    { input: '£39,314,700', expected: 39314700 },
    { input: '£10,000', expected: 10000 },
    { input: '£1,000,000', expected: 1000000 },
    { input: '£500', expected: 500 },
];

let amountPassed = 0;
amountTests.forEach((test, i) => {
    const result = parseAmount(test.input);
    const passed = result === test.expected;
    console.log(`Test ${i + 1}: ${test.input} => ${result} ${passed ? '✅' : '❌'}`);
    if (passed) amountPassed++;
});
console.log(`Amount Parsing: ${amountPassed}/${amountTests.length} passed\n`);

// Test Suite 2: Date Parsing
console.log('='.repeat(60));
console.log('Test Suite 2: Date Parsing');
console.log('='.repeat(60));

const dateTests = [
    { input: '5/08/2025', expected: '2025-08-05' },
    { input: '29/07/2025', expected: '2025-07-29' },
    { input: '14/07/2025', expected: '2025-07-14' },
    { input: '1/01/2024', expected: '2024-01-01' },
    { input: '31/12/2023', expected: '2023-12-31' },
];

let datePassed = 0;
dateTests.forEach((test, i) => {
    const result = parseDate(test.input);
    const resultStr = result ? result.toISOString().split('T')[0] : 'null';
    const passed = resultStr === test.expected;
    console.log(`Test ${i + 1}: ${test.input} => ${resultStr} ${passed ? '✅' : '❌'}`);
    if (passed) datePassed++;
});
console.log(`Date Parsing: ${datePassed}/${dateTests.length} passed\n`);

// Test Suite 3: Breach Type Categorization
console.log('='.repeat(60));
console.log('Test Suite 3: Breach Type Categorization');
console.log('='.repeat(60));

const breachTests = [
    {
        reason: 'market abuse and market manipulation',
        expected: 'Market Abuse'
    },
    {
        reason: 'money laundering risks and financial crime controls',
        expected: 'Financial Crime'
    },
    {
        reason: 'transaction reporting failures and MiFIR breaches',
        expected: 'Transaction Reporting'
    },
    {
        reason: 'inappropriate pension transfer advice',
        expected: 'Pension Transfer Advice'
    },
    {
        reason: 'failing to act with integrity and conduct rules',
        expected: 'Conduct & Integrity'
    },
    {
        reason: 'breach of Listing Rule 1.3.3R',
        expected: 'Listing Rules'
    },
    {
        reason: 'client money handling and account opening procedures',
        expected: 'Client Money & Assets'
    },
    {
        reason: 'SYSC violations and risk management systems',
        expected: 'Systems & Controls'
    },
    {
        reason: 'some other regulatory breach',
        expected: 'Other Regulatory Breach'
    },
];

let breachPassed = 0;
breachTests.forEach((test, i) => {
    const result = categorizeBreach(test.reason);
    const passed = result === test.expected;
    console.log(`Test ${i + 1}: ${result} ${passed ? '✅' : '❌'}`);
    if (!passed) console.log(`  Expected: ${test.expected}, Got: ${result}`);
    if (passed) breachPassed++;
});
console.log(`Breach Categorization: ${breachPassed}/${breachTests.length} passed\n`);

// Test Suite 4: Firm Category Categorization
console.log('='.repeat(60));
console.log('Test Suite 4: Firm Category Categorization');
console.log('='.repeat(60));

const firmTests = [
    {
        firm: 'John Smith',
        reason: 'individual trader breach',
        expected: 'Individual'
    },
    {
        firm: 'Barclays Bank plc',
        reason: 'banking operations',
        expected: 'Banking'
    },
    {
        firm: 'Goldman Sachs International',
        reason: 'investment bank sector breach',
        expected: 'Investment Banking'
    },
    {
        firm: 'BlackRock Asset Management',
        reason: 'asset management breach',
        expected: 'Asset Management'
    },
    {
        firm: 'Sigma Broking Limited',
        reason: 'trading firm sector',
        expected: 'Trading Firm'
    },
    {
        firm: 'Aviva Insurance Ltd',
        reason: 'insurance operations',
        expected: 'Insurance'
    },
    {
        firm: 'London Stock Exchange',
        reason: 'Recognised Investment Exchanges sector',
        expected: 'Exchange'
    },
    {
        firm: 'Financial Planning Ltd',
        reason: 'pension transfer advice',
        expected: 'Financial Planning'
    },
    {
        firm: 'Generic Corporation Limited',
        reason: 'some breach',
        expected: 'Corporate'
    },
];

let firmPassed = 0;
firmTests.forEach((test, i) => {
    const result = categorizeFirm(test.reason, test.firm);
    const passed = result === test.expected;
    console.log(`Test ${i + 1}: ${test.firm} => ${result} ${passed ? '✅' : '❌'}`);
    if (!passed) console.log(`  Expected: ${test.expected}, Got: ${result}`);
    if (passed) firmPassed++;
});
console.log(`Firm Categorization: ${firmPassed}/${firmTests.length} passed\n`);

// Test Suite 5: Full Data Processing Pipeline
console.log('='.repeat(60));
console.log('Test Suite 5: Full Data Processing Pipeline');
console.log('='.repeat(60));

const fullTests = [
    {
        firm: 'James Edward Staley',
        date: '23/07/2025',
        amount: '£1,107,306.92',
        reason: 'This Final Notice refers to breaches of Individual Conduct Rules 1 (not acting with integrity) and 3 (open and cooperative with regulators)',
    },
    {
        firm: 'Barclays Bank UK plc',
        date: '14/07/2025',
        amount: '£3,093,600',
        reason: 'breach of Principle 3 and SYSC 6.1.1R by failing to organise and control its affairs responsibly and effectively with adequate risk management systems in respect of its account opening procedures for client money accounts',
    },
];

let fullPassed = 0;
fullTests.forEach((test, i) => {
    console.log(`\nTest ${i + 1}: ${test.firm}`);

    const amount = parseAmount(test.amount);
    const date = parseDate(test.date);
    const breachType = categorizeBreach(test.reason);
    const firmCategory = categorizeFirm(test.reason, test.firm);

    let allValid = true;

    if (isNaN(amount)) {
        console.log('  ❌ Amount parsing failed');
        allValid = false;
    } else {
        console.log(`  ✅ Amount: £${amount.toLocaleString()}`);
    }

    if (!date) {
        console.log('  ❌ Date parsing failed');
        allValid = false;
    } else {
        console.log(`  ✅ Date: ${date.toISOString().split('T')[0]}`);
    }

    if (!breachType) {
        console.log('  ❌ Breach categorization failed');
        allValid = false;
    } else {
        console.log(`  ✅ Breach Type: ${breachType}`);
    }

    if (!firmCategory) {
        console.log('  ❌ Firm categorization failed');
        allValid = false;
    } else {
        console.log(`  ✅ Firm Category: ${firmCategory}`);
    }

    if (allValid) fullPassed++;
});
console.log(`\nFull Pipeline: ${fullPassed}/${fullTests.length} passed\n`);

// Test Suite 6: Edge Cases
console.log('='.repeat(60));
console.log('Test Suite 6: Edge Cases');
console.log('='.repeat(60));

const edgeTests = [
    {
        name: 'Large amount with decimals',
        test: () => parseAmount('£1,107,306.92') === 1107306.92
    },
    {
        name: 'Amount without commas',
        test: () => parseAmount('£500') === 500
    },
    {
        name: 'Single digit day/month',
        test: () => {
            const date = parseDate('1/1/2024');
            return date && date.toISOString().split('T')[0] === '2024-01-01';
        }
    },
    {
        name: 'Name with multiple parts',
        test: () => {
            const category = categorizeFirm('', 'Jean-Noel Alba');
            return category === 'Individual';
        }
    },
    {
        name: 'Company with complex name',
        test: () => {
            const category = categorizeFirm('', 'Mako Financial Markets Partnership LLP');
            return category !== 'Individual';
        }
    },
];

let edgePassed = 0;
edgeTests.forEach((test, i) => {
    const passed = test.test();
    console.log(`Test ${i + 1}: ${test.name} ${passed ? '✅' : '❌'}`);
    if (passed) edgePassed++;
});
console.log(`Edge Cases: ${edgePassed}/${edgeTests.length} passed\n`);

// Final Summary
console.log('\n' + '='.repeat(60));
console.log('📊 FINAL TEST SUMMARY');
console.log('='.repeat(60));

const totalTests = amountTests.length + dateTests.length + breachTests.length +
                    firmTests.length + fullTests.length + edgeTests.length;
const totalPassed = amountPassed + datePassed + breachPassed +
                     firmPassed + fullPassed + edgePassed;

console.log(`Total Tests: ${totalPassed}/${totalTests} passed`);
console.log(`Success Rate: ${((totalPassed/totalTests) * 100).toFixed(1)}%`);

console.log('\nBreakdown by Test Suite:');
console.log(`  Amount Parsing:         ${amountPassed}/${amountTests.length}`);
console.log(`  Date Parsing:           ${datePassed}/${dateTests.length}`);
console.log(`  Breach Categorization:  ${breachPassed}/${breachTests.length}`);
console.log(`  Firm Categorization:    ${firmPassed}/${firmTests.length}`);
console.log(`  Full Pipeline:          ${fullPassed}/${fullTests.length}`);
console.log(`  Edge Cases:             ${edgePassed}/${edgeTests.length}`);

if (totalPassed === totalTests) {
    console.log('\n🎉 All tests passed! Scraper is ready for production.');
    process.exit(0);
} else {
    console.log(`\n⚠️  ${totalTests - totalPassed} test(s) failed. Review issues above.`);
    process.exit(1);
}
