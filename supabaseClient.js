const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ylsbmxedhycjqaorjkvm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";

module.exports = createClient(SUPABASE_URL, SUPABASE_KEY);
