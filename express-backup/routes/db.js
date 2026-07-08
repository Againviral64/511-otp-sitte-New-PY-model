// routes/db.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

if (supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey && supabaseKey !== 'YOUR_SUPABASE_KEY') {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('Supabase connection initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize Supabase client:', err.message);
    }
} else {
    console.warn('⚠️ Supabase credentials are missing or default in .env. Running in Database-less / Local-Mock mode.');
}

export default supabase;
