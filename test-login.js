const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://jcqaesoavmxucexjeudq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcWFlc29hdm14dWNleGpldWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMDcxNTYsImV4cCI6MjA3MDU4MzE1Nn0.q9orbBAqo9eQfm8645zZyqW4TjWvRzNvIFfcEv7GJMI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "test_student_elementari@example.com",
    password: "Password123!"
  });

  console.log("data:", data);
  console.log("error:", error);
})();
