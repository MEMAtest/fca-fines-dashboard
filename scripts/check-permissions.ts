import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

async function checkPermissions() {
  console.log('🔍 Checking database permissions...\n');

  try {
    // Check eu_fines permissions
    const euPerms = await sql`
      SELECT
        grantee,
        privilege_type
      FROM information_schema.table_privileges
      WHERE table_name = 'eu_fines'
        AND table_schema = 'public'
      ORDER BY grantee, privilege_type
    `;

    console.log('📋 Permissions on eu_fines table:');
    euPerms.forEach(p => {
      console.log(`   ${p.grantee}: ${p.privilege_type}`);
    });

    // Check materialized view permissions
    const viewPerms = await sql`
      SELECT
        grantee,
        privilege_type
      FROM information_schema.table_privileges
      WHERE table_name = 'all_regulatory_fines'
        AND table_schema = 'public'
      ORDER BY grantee, privilege_type
    `;

    console.log('\n📊 Permissions on all_regulatory_fines view:');
    viewPerms.forEach(p => {
      console.log(`   ${p.grantee}: ${p.privilege_type}`);
    });

    // Verify fca_app has required permissions
    const fcaAppPerms = euPerms.filter(p => p.grantee === 'fca_app');
    const requiredPerms = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const hasAllPerms = requiredPerms.every(perm =>
      fcaAppPerms.some(p => p.privilege_type === perm)
    );

    console.log('\n✅ Permission Check:');
    console.log(`   fca_app has all required permissions: ${hasAllPerms ? '✓' : '✗'}`);

    if (!hasAllPerms) {
      console.log('   Missing:', requiredPerms.filter(perm =>
        !fcaAppPerms.some(p => p.privilege_type === perm)
      ));
    }

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error checking permissions:', error);
    await sql.end();
    process.exit(1);
  }
}

checkPermissions();
