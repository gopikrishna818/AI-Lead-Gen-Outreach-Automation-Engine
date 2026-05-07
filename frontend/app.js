// ==========================================
// CONFIGURATION: Add your Supabase Details
// ==========================================
// ⚠️ REPLACE THESE WITH YOUR ACTUAL SUPABASE URL AND KEY ⚠️
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhb...YOUR_ANON_KEY...';

let supabase;
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Supabase client failed to initialize. Check credentials.");
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Fetch REAL Data from Supabase on load
    fetchRealData();

    // 2. Handle Form Submission
    const leadForm = document.getElementById('leadForm');
    
    leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get form values
        const payload = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            companyName: document.getElementById('companyName').value,
            website: document.getElementById('website').value,
            email: document.getElementById('email').value,
            phoneNumber: document.getElementById('phoneNumber').value,
            linkedInURL: document.getElementById('linkedInURL').value
        };

        const webhookUrl = document.getElementById('webhookUrl').value;
        
        // Reset UI State
        resetWorkflowUI();
        logMessage('info', `Initializing Outreach Pipeline for ${payload.firstName} ${payload.lastName}...`);
        
        // Disable button
        const btn = leadForm.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>Processing...</span><i data-lucide="loader" class="spin"></i>';
        lucide.createIcons();
        btn.disabled = true;

        if (webhookUrl) {
            // Actual API Call to n8n
            logMessage('info', `Sending payload to real n8n Webhook: ${webhookUrl}`);
            activateStep(1);
            
            try {
                // We wait for the real workflow to finish and respond
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    completeStep(1);
                    activateStep(2);
                    
                    const responseData = await response.json().catch(() => ({}));
                    
                    logMessage('info', 'Webhook execution completed successfully.');
                    
                    // Display actual output from n8n in terminal
                    if(responseData) {
                        logMessage('info', `[REAL DATA] Payload processed: \n${JSON.stringify(responseData, null, 2)}`);
                    }
                    
                    // Fast forward steps since real execution happened
                    completeStep(2);
                    completeStep(3);
                    completeStep(4);

                    // Refresh dashboard with new real data
                    fetchRealData();
                } else {
                    logMessage('error', `n8n Webhook failed: ${response.status}`);
                    document.getElementById('step-1').classList.add('error');
                }
            } catch (error) {
                logMessage('error', `Network error: ${error.message}`);
                document.getElementById('step-1').classList.add('error');
            }
        } else {
            // No webhook provided, fallback to simulation
            logMessage('info', '⚠️ No Webhook URL provided. Running Visual Simulation Mode.');
            await simulateWorkflow(payload);
        }

        // Re-enable button
        btn.innerHTML = originalText;
        lucide.createIcons();
        btn.disabled = false;
    });
});

// ==========================================
// REAL Data Fetching Logic (Supabase)
// ==========================================
async function fetchRealData() {
    if (!supabase || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
        console.warn("Supabase credentials not configured. Showing empty/default data.");
        document.getElementById('valLeads').innerText = '0';
        document.getElementById('valCalls').innerText = '0';
        document.getElementById('valMeetings').innerText = '0';
        document.getElementById('activityFeed').innerHTML = '<p style="color: #94A3B8; font-size: 0.85rem; text-align: center;">Connect Supabase to view live activity.</p>';
        initChart([0,0,0,0]);
        return;
    }

    try {
        // NOTE: Adjust table names ('leads', 'calls') according to your actual Supabase schema
        
        // Fetch Metrics: Total Leads
        const { count: totalLeads, error: e1 } = await supabase.from('leads').select('*', { count: 'exact', head: true });
        if (!e1) document.getElementById('valLeads').innerText = totalLeads || 0;

        // Fetch Metrics: Total Calls
        const { count: totalCalls, error: e2 } = await supabase.from('calls').select('*', { count: 'exact', head: true });
        if (!e2) document.getElementById('valCalls').innerText = totalCalls || 0;

        // Fetch Metrics: Meetings Booked
        const { count: meetingsBooked, error: e3 } = await supabase.from('calls').select('*', { count: 'exact', head: true }).eq('intent', 'Interested');
        if (!e3) document.getElementById('valMeetings').innerText = meetingsBooked || 0;

        // Fetch Chart Data (Intent distribution)
        const { data: calls } = await supabase.from('calls').select('intent');
        if (calls) {
            const counts = { 'Interested': 0, 'Follow Up': 0, 'Not Interested': 0, 'Voicemail': 0 };
            calls.forEach(call => {
                if (counts[call.intent] !== undefined) counts[call.intent]++;
                else counts['Voicemail']++; // fallback
            });
            initChart([counts['Interested'], counts['Follow Up'], counts['Not Interested'], counts['Voicemail']]);
        } else {
            initChart([0,0,0,0]);
        }

        // Fetch Real Activity Feed
        const { data: recentCalls } = await supabase.from('calls')
            .select('*, leads(first_name, last_name, company_name)')
            .order('created_at', { ascending: false })
            .limit(4);
            
        if (recentCalls && recentCalls.length > 0) {
            const feed = document.getElementById('activityFeed');
            feed.innerHTML = ''; // clear dummy data
            
            recentCalls.forEach(call => {
                const leadName = call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'Unknown Lead';
                const company = call.leads ? call.leads.company_name : '';
                const timeAgo = formatTimeAgo(new Date(call.created_at));
                
                let icon = 'phone';
                let statusClass = 'pending';
                if(call.intent === 'Interested') { icon = 'calendar'; statusClass = 'success'; }
                if(call.intent === 'Not Interested') { icon = 'x-circle'; statusClass = 'error'; }
                
                feed.innerHTML += `
                    <div class="feed-item ${statusClass}">
                        <div class="feed-icon"><i data-lucide="${icon}"></i></div>
                        <div class="feed-info">
                            <p><strong>${call.intent || 'Call Completed'}</strong> with ${leadName} ${company ? `(${company})` : ''}</p>
                            <span>${timeAgo}</span>
                        </div>
                    </div>
                `;
            });
            lucide.createIcons();
        }

    } catch (e) {
        console.error("Error fetching real data from Supabase:", e);
    }
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
}

// ==========================================
// Simulation Logic (Fallback)
// ==========================================
async function simulateWorkflow(payload) {
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    activateStep(1);
    logMessage('info', 'Validating schema and data types...');
    await delay(1000);
    completeStep(1);

    activateStep(2);
    logMessage('info', `Scraping LinkedIn profile: ${payload.linkedInURL}`);
    await delay(1500);
    logMessage('info', 'Gemini AI generating 1-to-1 personalized script...');
    await delay(1000);
    completeStep(2);

    activateStep(3);
    logMessage('info', `Initiating AI Voice Call to ${payload.phoneNumber}...`);
    await delay(1500);
    logMessage('info', `[Transcript] Agent: "Hi ${payload.firstName}, should we book 15 mins next week?"`);
    await delay(1000);
    completeStep(3);

    activateStep(4);
    logMessage('info', 'Parsing call transcript with NLP...');
    await delay(800);
    logMessage('info', 'Syncing metadata to CRM...');
    completeStep(4);
}

// ==========================================
// UI Helpers
// ==========================================

function activateStep(stepNum) {
    const step = document.getElementById(`step-${stepNum}`);
    step.classList.add('active');
    step.querySelector('span').innerText = 'Processing...';
}

function completeStep(stepNum) {
    const step = document.getElementById(`step-${stepNum}`);
    step.classList.remove('active');
    step.classList.add('completed');
    step.querySelector('span').innerText = 'Completed';
}

function resetWorkflowUI() {
    for(let i=1; i<=4; i++) {
        const step = document.getElementById(`step-${i}`);
        step.classList.remove('active', 'completed', 'error');
        step.querySelector('span').innerText = 'Pending...';
    }
    const logContainer = document.getElementById('logContainer');
    logContainer.innerHTML = '';
}

function logMessage(type, message) {
    const container = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString();
    
    // Replace newlines with <br> for json formatting
    const formattedMessage = message.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
    
    const div = document.createElement('div');
    div.innerHTML = `<span class="time">[${time}]</span> <span class="${type}">${formattedMessage}</span>`;
    container.appendChild(div);
    
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// Chart.js Setup
// ==========================================
let chartInstance = null;
function initChart(data = [0, 0, 0, 0]) {
    const ctx = document.getElementById('intentChart').getContext('2d');
    
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Meeting Booked', 'Follow Up', 'Not Interested', 'Voicemail'],
            datasets: [{
                data: data,
                backgroundColor: ['#10B981', '#00E5FF', '#EF4444', '#9D4EDD'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { usePointStyle: true, padding: 20, font: { size: 11 } }
                }
            }
        }
    });
}
