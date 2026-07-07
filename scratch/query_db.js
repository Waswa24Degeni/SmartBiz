const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://eqooblgtdsiugoofgffu.supabase.co';
const supabaseAnonKey = 'sb_publishable_nR1qlNdxssZttxg2AXJ4Aw_5TU1WDkK';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'owner@smartbiz.tz',
    password: 'Owner@1234'
  });

  if (authError) {
    console.error('Authentication failed:', authError.message);
    return;
  }

  const businessId = 'a7be9e07-f100-4f17-bc27-39acf6acee89';
  console.log(`Executing fetch check on expenses table...`);
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Query error details:', error);
  } else {
    console.log('Query success! Expenses fetched:', data);
  }
}

run();
