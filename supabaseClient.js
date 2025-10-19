// supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// 🟢 Replace these with your actual Supabase project values
const supabaseUrl = "https://bqedllfttvheajqtpccg.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZWRsbGZ0dHZoZWFqcXRwY2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDkyOTEsImV4cCI6MjA3NjM4NTI5MX0.xqBvZZ8k0Sb5Be6MWkvCGTTwj3wvS4Si4yYKlCbWfY0";

// 🔗 Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
