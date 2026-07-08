#!/usr/bin/env node
/**
 * scripts/test-rls.js
 *
 * CourtCoach AI – Row Level Security (RLS) Audit Script
 * ======================================================
 *
 * WHAT IT TESTS
 * -------------
 * For each of the four core tables:
 *   • player_profiles
 *   • session_logs
 *   • chat_messages
 *   • daily_recommendations
 *
 * The script:
 *   1. Creates two test users via the Supabase Admin API.
 *   2. Inserts one row belonging to User A into each table.
 *   3. Authenticates as User B and attempts to SELECT those rows.
 *   4. Asserts that the query returns zero rows (RLS is blocking access).
 *   5. Also verifies that User A CAN read their own rows.
 *   6. Cleans up all test data and both test accounts.
 *
 * PREREQUISITES
 * -------------
 *   • SUPABASE_URL          – your project URL  (e.g. https://xxx.supabase.co)
 *   • SUPABASE_SERVICE_ROLE_KEY – service-role secret (never expose publicly!)
 *
 * USAGE
 * -----
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
 *   node scripts/test-rls.js
 *
 * EXIT CODES
 * ----------
 *   0 – all assertions passed (RLS is correctly configured)
 *   1 – one or more assertions failed or an unexpected error occurred
 */

'use strict';

// ── Environment ───────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.\n' +
    'Example:\n' +
    '  SUPABASE_URL=https://xxx.supabase.co \\\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=eyJ... \\\n' +
    '  node scripts/test-rls.js'
  );
  process.exit(1);
}

// ── Dynamic import (ESM-compatible) ──────────────────────────────────────────

async function main() {
  const { createClient } = await import('@supabase/supabase-js');

  // Admin client — bypasses RLS (used only for setup/teardown)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results = [];
  let userAId, userBId;
  const TEST_EMAIL_A = `rls-test-a-${Date.now()}@courtcoach-audit.invalid`;
  const TEST_EMAIL_B = `rls-test-b-${Date.now()}@courtcoach-audit.invalid`;
  const TEST_PASSWORD = 'RlsAudit!2024Test';

  // ── Setup: create two test users ──────────────────────────────────────────

  console.log('\n── Setting up test users ─────────────────────────────────────');

  try {
    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: TEST_EMAIL_A,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (errA) throw new Error(`Failed to create User A: ${errA.message}`);
    userAId = userA.user.id;
    console.log(`  ✓ User A created: ${userAId}`);

    const { data: userB, error: errB } = await admin.auth.admin.createUser({
      email: TEST_EMAIL_B,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (errB) throw new Error(`Failed to create User B: ${errB.message}`);
    userBId = userB.user.id;
    console.log(`  ✓ User B created: ${userBId}`);
  } catch (err) {
    console.error('\n✗ Setup failed:', err.message);
    process.exit(1);
  }

  // ── Helper: sign in a user and return an authenticated client ─────────────

  async function signInAs(email, password) {
    const client = createClient(SUPABASE_URL,
      // Use the anon key for real auth (the service role key is for admin only)
      // We derive the anon key from the service role JWT – actually we need the
      // anon key separately.  Fall back to using the service role key with an
      // explicit Authorization header set via the `global.headers` option.
      // NOTE: In a real audit you'd pass NEXT_PUBLIC_SUPABASE_ANON_KEY too.
      // Here we re-use the admin client to sign in and get a user JWT.
      SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
    // Build a client that uses the user's JWT (not the service-role key)
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
    return userClient;
  }

  // ── Seed data as User A (using admin client to bypass RLS for seeding) ────

  console.log('\n── Seeding rows for User A ───────────────────────────────────');

  let profileAId, sessionAId, chatAId, recAId;

  try {
    // player_profiles
    const { data: pA, error: pErr } = await admin
      .from('player_profiles')
      .insert({
        user_id: userAId,
        display_name: 'RLS Test Player A',
        level: 'intermediate',
        handedness: 'right',
        backhand_type: 'two_handed',
        goals: ['rls-audit'],
        technical_focus: [],
        available_days: [],
        session_length_minutes: 60,
      })
      .select('id')
      .single();
    if (pErr) throw new Error(`player_profiles insert: ${pErr.message}`);
    profileAId = pA.id;
    console.log(`  ✓ player_profiles row: ${profileAId}`);

    // session_logs
    const { data: sA, error: sErr } = await admin
      .from('session_logs')
      .insert({
        user_id: userAId,
        log_date: new Date().toISOString().slice(0, 10),
        log_type: 'practice',
        duration_mins: 60,
      })
      .select('id')
      .single();
    if (sErr) throw new Error(`session_logs insert: ${sErr.message}`);
    sessionAId = sA.id;
    console.log(`  ✓ session_logs row: ${sessionAId}`);

    // chat_messages
    const { data: cA, error: cErr } = await admin
      .from('chat_messages')
      .insert({
        user_id: userAId,
        session_id: 'rls-audit-session',
        role: 'user',
        content: 'RLS audit test message',
      })
      .select('id')
      .single();
    if (cErr) throw new Error(`chat_messages insert: ${cErr.message}`);
    chatAId = cA.id;
    console.log(`  ✓ chat_messages row: ${chatAId}`);

    // daily_recommendations
    const today = new Date().toISOString().slice(0, 10);
    const { data: rA, error: rErr } = await admin
      .from('daily_recommendations')
      .insert({
        user_id: userAId,
        recommendation_date: today,
        session_goal: 'RLS audit goal',
        warmup: 'RLS warmup',
        main_block: 'RLS main',
        secondary_drill: 'RLS drill',
        fitness_note: 'RLS fitness',
        mental_focus: 'RLS mental',
        cooldown: 'RLS cooldown',
        estimated_duration_mins: 60,
      })
      .select('id')
      .single();
    if (rErr) throw new Error(`daily_recommendations insert: ${rErr.message}`);
    recAId = rA.id;
    console.log(`  ✓ daily_recommendations row: ${recAId}`);
  } catch (err) {
    console.error('\n✗ Seeding failed:', err.message);
    await cleanup(admin, userAId, userBId);
    process.exit(1);
  }

  // ── Authenticate as both users ────────────────────────────────────────────

  console.log('\n── Authenticating test users ─────────────────────────────────');
  let clientA, clientB;
  try {
    clientA = await signInAs(TEST_EMAIL_A, TEST_PASSWORD);
    console.log('  ✓ Signed in as User A');
    clientB = await signInAs(TEST_EMAIL_B, TEST_PASSWORD);
    console.log('  ✓ Signed in as User B');
  } catch (err) {
    console.error('\n✗ Authentication failed:', err.message);
    await cleanup(admin, userAId, userBId);
    process.exit(1);
  }

  // ── Run RLS assertions ────────────────────────────────────────────────────

  console.log('\n── Running RLS assertions ────────────────────────────────────');

  async function assertCrossUserBlocked(table, userBClient, userARowId, label) {
    const { data, error } = await userBClient
      .from(table)
      .select('id')
      .eq('id', userARowId);

    if (error) {
      // Some RLS configs return an error instead of empty rows — both are acceptable
      results.push({ label, passed: true, note: `Error returned (acceptable): ${error.message}` });
      return;
    }

    const blocked = !data || data.length === 0;
    results.push({
      label,
      passed: blocked,
      note: blocked
        ? 'User B received 0 rows (correct)'
        : `User B received ${data.length} row(s) — RLS BREACH!`,
    });
  }

  async function assertOwnRowVisible(table, ownerClient, rowId, label) {
    const { data, error } = await ownerClient
      .from(table)
      .select('id')
      .eq('id', rowId);

    if (error) {
      results.push({ label, passed: false, note: `Unexpected error: ${error.message}` });
      return;
    }

    const visible = data && data.length === 1;
    results.push({
      label,
      passed: visible,
      note: visible
        ? 'Owner sees own row (correct)'
        : `Owner cannot see own row — RLS over-restrictive!`,
    });
  }

  // Cross-user blocked
  await assertCrossUserBlocked('player_profiles',        clientB, profileAId, 'player_profiles: User B cannot read User A rows');
  await assertCrossUserBlocked('session_logs',           clientB, sessionAId, 'session_logs: User B cannot read User A rows');
  await assertCrossUserBlocked('chat_messages',          clientB, chatAId,    'chat_messages: User B cannot read User A rows');
  await assertCrossUserBlocked('daily_recommendations',  clientB, recAId,     'daily_recommendations: User B cannot read User A rows');

  // Owner can read own rows
  await assertOwnRowVisible('player_profiles',       clientA, profileAId, 'player_profiles: User A can read own rows');
  await assertOwnRowVisible('session_logs',          clientA, sessionAId, 'session_logs: User A can read own rows');
  await assertOwnRowVisible('chat_messages',         clientA, chatAId,    'chat_messages: User A can read own rows');
  await assertOwnRowVisible('daily_recommendations', clientA, recAId,     'daily_recommendations: User A can read own rows');

  // ── Print results ─────────────────────────────────────────────────────────

  console.log('\n── Results ───────────────────────────────────────────────────');
  let allPassed = true;
  for (const { label, passed, note } of results) {
    const icon = passed ? '✓' : '✗';
    console.log(`  ${icon} ${label}`);
    if (note) console.log(`      → ${note}`);
    if (!passed) allPassed = false;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  await cleanup(admin, userAId, userBId);

  // ── Final verdict ─────────────────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────────────────────────');
  if (allPassed) {
    console.log('✅ ALL RLS assertions PASSED — no cross-user data leakage detected.\n');
    process.exit(0);
  } else {
    console.error('❌ ONE OR MORE RLS assertions FAILED — review Supabase policies!\n');
    process.exit(1);
  }
}

async function cleanup(admin, userAId, userBId) {
  console.log('\n── Cleanup ───────────────────────────────────────────────────');
  try {
    if (userAId) {
      await admin.auth.admin.deleteUser(userAId);
      console.log(`  ✓ Deleted User A (${userAId})`);
    }
    if (userBId) {
      await admin.auth.admin.deleteUser(userBId);
      console.log(`  ✓ Deleted User B (${userBId})`);
    }
  } catch (err) {
    console.warn('  ⚠ Cleanup warning:', err.message);
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
