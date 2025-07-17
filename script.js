// Updated code with new Supabase configuration and enhanced user management
// Supabase configuration
const supabaseUrl = 'https://gaqyuylvawgoxuaevhsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhcXl1eWx2YXdnb3h1YWV2aHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MDExNTQsImV4cCI6MjA2Nzk3NzE1NH0.tRJXi5vTSopCza_61sYu2ccOrk8LR7UvJ07JPP07OEI';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Global variables
let currentUser = null;
let userSession = null;
let quizzes = [];
let currentQuiz = null;
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let quizStartTime = null;
let timerInterval = null;
let markedQuestions = new Set();

// Utility functions
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Trial and Premium Management
let accessStatus = null;
let userAnalytics = {
    totalTests: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    accuracy: 0,
    completionRate: 0,
    percentile: 0,
    subjectStats: {},
    recentTests: [],
    improvementTrend: []
};

async function initializeUser() {
    // Check if user is already logged in
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        await showLoginModal();
        return;
    }

    userSession = session;
    currentUser = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata.full_name || session.user.email
    };

    // Check if user exists in our system and create only if doesn't exist
    await ensureUserExists();

    // Check access status
    await checkGlobalAccess();

    // Profile data will be loaded in DOMContentLoaded event
}

async function ensureUserExists() {
    if (!currentUser) return;

    // Check if user exists in user_profiles table
    const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    if (!existingProfile) {
        // Insert new user profile
        const { error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                user_id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name
            });

        if (profileError && !profileError.message.includes('duplicate')) {
            console.error('Error creating user profile:', profileError);
        }
    }

    // Check if user exists in trials table
    const { data: existingTrial } = await supabase
        .from('user_trials')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    if (!existingTrial) {
        // Insert new user trial only if doesn't exist
        const { error } = await supabase
            .from('user_trials')
            .insert({
                user_id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name,
                start_date: new Date().toISOString()
            });

        if (error && !error.message.includes('duplicate')) {
            console.error('Error creating user trial:', error);
        }
    }
}

async function checkGlobalAccess() {
    if (!currentUser || !userSession) {
        return false;
    }

    // Check trial status first
    const { data: trial } = await supabase
        .from('user_trials')
        .select('start_date')
        .eq('user_id', currentUser.id)
        .single();

    if (trial) {
        const startDate = new Date(trial.start_date);
        const threeDaysLater = new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000));
        const now = new Date();

        if (now <= threeDaysLater) {
            accessStatus = 'trial';
            return true;
        }
    }

    // Check premium status
    const { data: premium } = await supabase
        .from('premium_users')
        .select('expiry_date')
        .eq('user_id', currentUser.id)
        .single();

    if (premium) {
        const expiryDate = new Date(premium.expiry_date);
        const now = new Date();

        if (now <= expiryDate) {
            accessStatus = 'premium';
            return true;
        }
    }

    // No access - show premium modal
    accessStatus = 'expired';
    showPremiumModal();
    return false;
}

function showPremiumModal() {
    const existingModal = document.getElementById('premiumModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'premiumModal';
    modal.className = 'modal premium-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    modal.innerHTML = `
        <div class="modal-content premium-content" style="background: var(--bg-secondary); padding: 2rem; border-radius: 16px; max-width: 500px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
            <div class="premium-header">
                <h2 style="color: var(--danger); margin-bottom: 1rem;">🚀 Trial Expired</h2>
                <p style="color: var(--text-secondary); margin-bottom: 2rem;">Your 3-day free trial has ended. Upgrade to Premium to continue accessing all quizzes!</p>
            </div>
            <div class="premium-features" style="text-align: left; margin-bottom: 2rem;">
                <h3 style="color: var(--text-primary); margin-bottom: 1rem;">Premium Benefits:</h3>
                <ul style="list-style: none; padding: 0;">
                    <li style="padding: 0.5rem 0; color: var(--secondary);">✅ Unlimited access to all quizzes</li>
                    <li style="padding: 0.5rem 0; color: var(--secondary);">✅ 1 month of full access</li>
                    <li style="padding: 0.5rem 0; color: var(--secondary);">✅ Detailed analytics and progress tracking</li>
                    <li style="padding: 0.5rem 0; color: var(--secondary);">✅ Priority support</li>
                </ul>
            </div>
            <div class="premium-pricing">
                <div class="price" style="font-size: 2rem; font-weight: bold; color: var(--primary); margin-bottom: 1rem;">₹99 for 1 month</div>
                <button class="btn btn-premium" onclick="initiatePremiumPayment()" style="background: var(--secondary); color: white; border: none; padding: 1rem 2rem; font-size: 1.1rem; border-radius: 8px; cursor: pointer; width: 100%; margin-bottom: 1rem;">Buy Premium Now</button>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">Secure payment powered by Razorpay</p>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('show');
}

async function initiatePremiumPayment() {
    if (!currentUser) {
        alert('Please refresh the page and try again.');
        return;
    }

    // Show loading state
    const buyButton = document.querySelector('.btn-premium');
    const originalText = buyButton.textContent;
    buyButton.textContent = 'Loading...';
    buyButton.disabled = true;

    try {
        const options = {
            key: 'rzp_test_o1mGGxGdk4rBCk',
            amount: 9900, // ₹99 in paise
            currency: 'INR',
            name: 'Test Sagar Premium',
            description: 'Unlock all quizzes for 1 month',
            image: '/logo.png',
            prefill: {
                name: currentUser.name,
                email: currentUser.email,
                contact: ''
            },
            theme: {
                color: '#6366F1'
            },
            handler: async function(response) {
                await handlePaymentSuccess(response);
            },
            modal: {
                ondismiss: function() {
                    console.log('Payment cancelled');
                    buyButton.textContent = originalText;
                    buyButton.disabled = false;
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();
    } catch (error) {
        console.error('Error initiating payment:', error);
        alert('Error starting payment. Please try again.');
        buyButton.textContent = originalText;
        buyButton.disabled = false;
    }
}

async function handlePaymentSuccess(paymentResponse) {
    try {
        console.log('Payment successful:', paymentResponse);

        const premiumModal = document.getElementById('premiumModal');
        if (premiumModal) {
            premiumModal.querySelector('.premium-content').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2 style="color: var(--secondary);">🎉 Payment Successful!</h2>
                    <p>Processing your premium access...</p>
                    <div style="margin: 1rem 0;">
                        <div style="width: 40px; height: 40px; border: 4px solid var(--light-gray); border-top: 4px solid var(--secondary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                    </div>
                </div>
            `;
        }

        // Ensure user session is valid
        if (!userSession || !currentUser) {
            throw new Error('User session is invalid. Please refresh and try again.');
        }

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month from now

        // First, delete any existing trial record to prevent conflicts
        const { error: deleteError } = await supabase
            .from('user_trials')
            .delete()
            .eq('user_id', currentUser.id);

        if (deleteError) {
            console.log('Note: No trial record to delete or delete failed:', deleteError.message);
        } else {
            console.log('Trial record deleted successfully');
        }

        // Then add to premium users with proper user context
        const { data: premiumData, error: premiumError } = await supabase
            .from('premium_users')
            .upsert({
                user_id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name,
                payment_id: paymentResponse.razorpay_payment_id,
                expiry_date: expiryDate.toISOString(),
                start_date: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select();

        if (premiumError) {
            console.error('Premium insertion error:', premiumError);
            throw new Error(`Failed to activate premium: ${premiumError.message}`);
        }

        // Update access status immediately
        accessStatus = 'premium';

        // Clear all caches to force fresh data load
        clearAllCache();
        profileDataCache = null;
        profileCacheTimestamp = null;

        // Update the modal to show success
        if (premiumModal) {
            premiumModal.querySelector('.premium-content').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2 style="color: var(--secondary);">🎉 Premium Activated!</h2>
                    <p style="color: var(--text-primary);">Your premium access has been successfully activated!</p>
                    <p style="color: var(--text-secondary); margin: 1rem 0;">Payment ID: ${paymentResponse.razorpay_payment_id}</p>
                    <p style="color: var(--secondary); font-weight: 500;">You now have full access for 1 month.</p>
                    <button onclick="window.location.reload()" style="background: var(--secondary); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; margin-top: 1.5rem;">Continue to Dashboard</button>
                </div>
            `;
        }

        // Force immediate reload to show premium status
        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error('Error updating premium status:', error);
        const premiumModal = document.getElementById('premiumModal');
        if (premiumModal) {
            premiumModal.querySelector('.premium-content').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2 style="color: var(--danger);">⚠️ Processing Error</h2>
                    <p>Payment was successful but there was an error activating your premium access.</p>
                    <p style="color: var(--text-secondary); margin: 1rem 0;">Payment ID: ${paymentResponse.razorpay_payment_id}</p>
                    <p style="color: var(--text-secondary);">Error: ${error.message}</p>
                    <div style="margin-top: 1.5rem;">
                        <button onclick="retryPaymentActivation('${paymentResponse.razorpay_payment_id}')" style="background: var(--primary); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; margin-right: 1rem;">Retry Activation</button>
                        <button onclick="window.location.reload()" style="background: var(--secondary); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer;">Continue</button>
                    </div>
                </div>
            `;
        }
    }
}

async function updateUserProfile(newName, newEmail) {
    if (!currentUser) {
        alert('Please log in first');
        return false;
    }

    try {
        // Update user metadata in Supabase Auth
        const { data, error: authError } = await supabase.auth.updateUser({
            email: newEmail,
            data: { full_name: newName }
        });

        if (authError) throw authError;

        // Update user profile in our database
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({
                name: newName,
                email: newEmail,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id);

        if (profileError) throw profileError;

        // Also update premium_users table if user is premium
        if (accessStatus === 'premium') {
            const { error: premiumUpdateError } = await supabase
                .from('premium_users')
                .update({
                    name: newName,
                    email: newEmail
                })
                .eq('user_id', currentUser.id);

            if (premiumUpdateError) {
                console.warn('Error updating premium user profile:', premiumUpdateError);
            }
        }

        // Also update user_trials table if user is on trial
        if (accessStatus === 'trial') {
            const { error: trialUpdateError } = await supabase
                .from('user_trials')
                .update({
                    name: newName,
                    email: newEmail
                })
                .eq('user_id', currentUser.id);

            if (trialUpdateError) {
                console.warn('Error updating trial user profile:', trialUpdateError);
            }
        }

        // Update current user object
        currentUser.name = newName;
        currentUser.email = newEmail;

        // Clear cache to force fresh data load
        invalidateProfileCache();

        return true;
    } catch (error) {
        console.error('Error updating profile:', error);
        return false;
    }
}

async function updateUserProfileNameOnly(newName) {
    if (!currentUser) {
        alert('Please log in first');
        return false;
    }

    try {
        // Update user metadata in Supabase Auth (only name)
        const { data, error: authError } = await supabase.auth.updateUser({
            data: { full_name: newName }
        });

        if (authError) throw authError;

        // Update user profile in our database (only name)
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({
                name: newName,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id);

        if (profileError) throw profileError;

        // Also update premium_users table if user is premium (only name)
        if (accessStatus === 'premium') {
            const { error: premiumUpdateError } = await supabase
                .from('premium_users')
                .update({
                    name: newName
                })
                .eq('user_id', currentUser.id);

            if (premiumUpdateError) {
                console.warn('Error updating premium user profile:', premiumUpdateError);
            }
        }

        // Also update user_trials table if user is on trial (only name)
        if (accessStatus === 'trial') {
            const { error: trialUpdateError } = await supabase
                .from('user_trials')
                .update({
                    name: newName
                })
                .eq('user_id', currentUser.id);

            if (trialUpdateError) {
                console.warn('Error updating trial user profile:', trialUpdateError);
            }
        }

        // Update current user object (only name)
        currentUser.name = newName;

        // Clear cache to force fresh data load
        invalidateProfileCache();

        return true;
    } catch (error) {
        console.error('Error updating profile:', error);
        return false;
    }
}

async function showLoginModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.add('show');
            setupAuthForms();

            const checkAuth = setInterval(async () => {
                if (currentUser && userSession) {
                    modal.classList.remove('show');
                    modal.style.display = 'none';
                    clearInterval(checkAuth);
                    resolve();
                }
            }, 500);
        }
    });
}

function setupAuthForms() {
    const loginSubmit = document.getElementById('loginSubmit');
    const registerSubmit = document.getElementById('registerSubmit');

    if (loginSubmit) loginSubmit.onclick = handleLogin;
    if (registerSubmit) registerSubmit.onclick = handleRegister;

    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    const confirmPassword = document.getElementById('confirmPassword');
    if (confirmPassword) {
        confirmPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleRegister();
        });
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showAuthStatus('Please fill in all fields', 'error');
        return;
    }

    showAuthStatus('Logging in...', 'loading');

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        userSession = data.session;
        currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata.full_name || data.user.email
        };

        showAuthStatus('Login successful!', 'success');

        await ensureUserExists();

        setTimeout(() => {
            const modal = document.getElementById('loginModal');
            if (modal) modal.classList.remove('show');
            window.location.reload();
        }, 1000);

    } catch (error) {
        showAuthStatus(error.message, 'error');
    }
}

async function handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!name || !email || !password || !confirmPassword) {
        showAuthStatus('Please fill in all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showAuthStatus('Password must be at least 6 characters', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showAuthStatus('Passwords do not match', 'error');
        return;
    }

    showAuthStatus('Creating account...', 'loading');

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name
                }
            }
        });

        if (error) throw error;

        if (data.user && !data.session) {
            showAuthStatus('Please check your email to confirm your account', 'success');
        } else if (data.session) {
            userSession = data.session;
            currentUser = {
                id: data.user.id,
                email: data.user.email,
                name: name
            };

            showAuthStatus('Account created successfully!', 'success');

            await ensureUserExists();

            setTimeout(() => {
                const modal = document.getElementById('loginModal');
                if (modal) modal.classList.remove('show');
                window.location.reload();
            }, 1000);
        }

    } catch (error) {
        showAuthStatus(error.message, 'error');
    }
}

function showAuthStatus(message, type) {
    const statusDiv = document.getElementById('authStatus');
    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.className = `auth-status ${type}`;
        statusDiv.textContent = message;
    }
}

function showLoginForm() {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const authStatus = document.getElementById('authStatus');

    if (registerForm) registerForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    if (authStatus) authStatus.style.display = 'none';
}

function showRegisterForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authStatus = document.getElementById('authStatus');

    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    if (authStatus) authStatus.style.display = 'none';
}

async function logout() {
    try {
        await supabase.auth.signOut();
        currentUser = null;
        userSession = null;

        // Clear all cached data
        clearAllCache();

        window.location.reload();
    } catch (error) {
        console.error('Error logging out:', error);
        alert('Error logging out. Please try again.');
    }
}

// Function to clear all cached data
function clearAllCache() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.includes('profile_data_') || key.includes('quizzes_') || key.includes('_timestamp')) {
            localStorage.removeItem(key);
        }
    });
    console.log('All cache cleared');
}

async function checkUserAccess() {
    if (!currentUser) {
        alert('Please refresh the page and login.');
        return false;
    }

    if (accessStatus === 'trial' || accessStatus === 'premium') {
        return true;
    }

    if (accessStatus === 'expired') {
        showPremiumModal();
        return false;
    }

    return await checkGlobalAccess();
}

// Enhanced Analytics Functions
async function loadUserAnalytics() {
    if (!currentUser) {
        console.log('No current user, loading default analytics');
        calculateUserAnalytics([]);
        updateAnalyticsDisplay();
        updateHomePageStats();
        return;
    }

    console.log('Loading analytics data for user:', currentUser.id);

    try {
        const { data: results, error } = await supabase
            .from('test_results')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('completed_at', { ascending: false });

        if (error) throw error;

        console.log('Loaded test results:', results?.length || 0);
        calculateUserAnalytics(results || []);
        updateAnalyticsDisplay();
        updateHomePageStats();

    } catch (error) {
        console.error('Error loading analytics:', error);
        // Load defaults on error
        calculateUserAnalytics([]);
        updateAnalyticsDisplay();
        updateHomePageStats();
    }
}

function calculateUserAnalytics(results) {
    console.log('Calculating analytics for', results.length, 'results');

    if (results.length === 0) {
        // Show realistic demo data when no tests taken
        userAnalytics = {
            totalTests: 0,
            totalCorrect: 0,
            totalQuestions: 0,
            accuracy: 0,
            completionRate: 0,
            percentile: 0,
            subjectStats: {
                Physics: { correct: 0, total: 0, percentage: 0 },
                Chemistry: { correct: 0, total: 0, percentage: 0 },
                Mathematics: { correct: 0, total: 0, percentage: 0 }
            },
            recentTests: [],
            improvementTrend: []
        };
        return;
    }

    // Calculate basic stats
    userAnalytics.totalTests = results.length;
    userAnalytics.totalCorrect = results.reduce((sum, result) => sum + (result.correct || 0), 0);
    userAnalytics.totalQuestions = results.reduce((sum, result) => sum + (result.total || 0), 0);
    userAnalytics.accuracy = userAnalytics.totalQuestions > 0 ?
        Math.round((userAnalytics.totalCorrect / userAnalytics.totalQuestions) * 100) : 0;

    // Calculate completion rate based on tests taken vs expected frequency
    const daysActive = Math.max(1, Math.ceil((Date.now() - new Date(results[results.length - 1].completed_at).getTime()) / (24 * 60 * 60 * 1000)));
    const expectedTests = Math.min(30, daysActive * 0.5); // Expect 0.5 tests per day, max 30
    userAnalytics.completionRate = Math.min(100, Math.round((userAnalytics.totalTests / expectedTests) * 100));

    // Percentile calculation removed
    userAnalytics.percentile = 0;

    // Calculate subject-wise performance
    userAnalytics.subjectStats = {};
    const defaultSubjects = ['Physics', 'Chemistry', 'Mathematics'];

    // Initialize default subjects
    defaultSubjects.forEach(subject => {
        userAnalytics.subjectStats[subject] = { correct: 0, total: 0, percentage: 0 };
    });

    results.forEach(result => {
        if (result.subject_stats) {
            try {
                const subjects = typeof result.subject_stats === 'string' ?
                    JSON.parse(result.subject_stats) : result.subject_stats;

                Object.keys(subjects).forEach(subject => {
                    // Normalize subject names
                    const normalizedSubject = subject === 'Maths' ? 'Mathematics' : subject;

                    if (!userAnalytics.subjectStats[normalizedSubject]) {
                        userAnalytics.subjectStats[normalizedSubject] = { correct: 0, total: 0, percentage: 0 };
                    }
                    userAnalytics.subjectStats[normalizedSubject].correct += subjects[subject].correct || 0;
                    userAnalytics.subjectStats[normalizedSubject].total += subjects[subject].total || 0;
                });
            } catch (e) {
                console.error('Error parsing subject stats:', e);
            }
        }
    });

    // Calculate percentages for subjects
    Object.keys(userAnalytics.subjectStats).forEach(subject => {
        const stats = userAnalytics.subjectStats[subject];
        stats.percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    });

    // Calculate improvement trend (last 5 tests)
    userAnalytics.recentTests = results.slice(0, 5);
    userAnalytics.improvementTrend = userAnalytics.recentTests.reverse().map(test => test.percentage || 0);

    console.log('Calculated analytics:', userAnalytics);
}

function updateAnalyticsDisplay() {
    console.log('Updating analytics display with:', userAnalytics);

    // Update analytics page overall performance
    const statsContainer = document.querySelector('#analytics-page .performance-stats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${userAnalytics.accuracy}%</div>
                <div class="stat-label">Accuracy</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${userAnalytics.totalTests}</div>
                <div class="stat-label">Tests Taken</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${userAnalytics.completionRate}%</div>
                <div class="stat-label">Completion</div>
            </div>
        `;
        console.log('Updated analytics overall performance stats');
    }

    // Update subject performance
    const subjectContainer = document.querySelector('#analytics-page .subject-performance');
    if (subjectContainer) {
        const hasRealData = Object.values(userAnalytics.subjectStats).some(stats => stats.total > 0);

        if (hasRealData) {
            subjectContainer.innerHTML = Object.entries(userAnalytics.subjectStats)
                .filter(([subject, stats]) => stats.total > 0)
                .map(([subject, stats]) => `
                    <div class="subject-stat">
                        <span class="subject-name">${subject}</span>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${stats.percentage}%"></div>
                        </div>
                        <span class="percentage">${stats.percentage}%</span>
                    </div>
                `).join('');
            console.log('Updated subject performance with real data');
        } else {
            subjectContainer.innerHTML = `
                <div class="subject-stat">
                    <span class="subject-name">Physics</span>
                    <div class="progress-bar">
                        <div class="progress" style="width: 0%"></div>
                    </div>
                    <span class="percentage">0%</span>
                </div>
                <div class="subject-stat">
                    <span class="subject-name">Chemistry</span>
                    <div class="progress-bar">
                        <div class="progress" style="width: 0%"></div>
                    </div>
                    <span class="percentage">0%</span>
                </div>
                <div class="subject-stat">
                    <span class="subject-name">Mathematics</span>
                    <div class="progress-bar">
                        <div class="progress" style="width: 0%"></div>
                    </div>
                    <span class="percentage">0%</span>
                </div>
            `;
            console.log('Updated subject performance with default data (no tests taken)');
        }
    }

    // Update recent tests list
    const recentTestsContainer = document.getElementById('recentTestsList');
    if (recentTestsContainer) {
        if (userAnalytics.recentTests.length > 0) {
            recentTestsContainer.innerHTML = userAnalytics.recentTests.map(test => `
                <div class="test-item">
                    <div class="test-item-info">
                        <h4>${test.test_name || 'Test'}</h4>
                        <p>${new Date(test.completed_at).toLocaleDateString()}</p>
                    </div>
                    <div class="test-score">${test.percentage}%</div>
                </div>
            `).join('');
            console.log('Updated recent tests with real data');
        } else {
            recentTestsContainer.innerHTML = '<p>No recent tests found. Take a test to see your progress!</p>';
            console.log('Updated recent tests with default message');
        }
    }

    // Update improvement trend chart
    const trendContainer = document.getElementById('improvementTrend');
    if (trendContainer) {
        if (userAnalytics.improvementTrend.length > 0) {
            const maxScore = Math.max(...userAnalytics.improvementTrend, 50); // Ensure reasonable scale
            trendContainer.innerHTML = `
                <div class="trend-chart">
                    ${userAnalytics.improvementTrend.map((score, index) => `
                        <div class="trend-bar" style="height: ${Math.max((score / maxScore) * 100, 10)}%; background: linear-gradient(to top, var(--primary), var(--secondary));">
                            <span class="trend-score">${score}%span>
                        </div>
                    `).join('')}
                </div>
                <p style="text-align: center; margin-top: 1rem; color: var(--text-secondary); font-size: 0.9rem;">
                    Last ${userAnalytics.improvementTrend.length} tests performance
                </p>
            `;
            console.log('Updated improvement trend with real data');
        } else {
            trendContainer.innerHTML = '<p>Take more tests to see your improvement trend!</p>';
            console.log('Updated improvement trend with default message');
        }
    }
}

function updateHomePageStats() {
    const homeStats = document.getElementById('performanceStats');
    if (homeStats) {
        const accuracy = userAnalytics.accuracy || 0;
        const totalTests = userAnalytics.totalTests || 0;
        const completionRate = userAnalytics.completionRate || 0;
        const percentile = userAnalytics.percentile || 0;

        homeStats.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${accuracy}%</div>
                <div class="stat-label">Accuracy            </div>
            <div class="stat-item">
                <div class="stat-value">${totalTests}</div>
                <div class="stat-label">Tests Taken</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${completionRate}%</div>
                <div class="stat-label">Completion</div>
            </div>
        `;
        console.log('Updated home page stats with:', { accuracy, totalTests, completionRate, percentile });
    }
}

// Quiz loading functions
async function loadQuizzes(streamFilter = null) {
    try {
        // Check cache first
        const cacheKey = streamFilter ? `quizzes_${streamFilter}` : 'quizzes_all';
        const cachedQuizzes = localStorage.getItem(cacheKey);
        const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);

        if (cachedQuizzes && cacheTimestamp) {
            const age = Date.now() - parseInt(cacheTimestamp);
            const tenMinutes = 10 * 60 * 1000; // Cache quizzes for 10 minutes

            if (age < tenMinutes) {
                console.log('Using cached quiz data');
                quizzes = JSON.parse(cachedQuizzes);
                console.log('Loaded quizzes from cache:', quizzes.length);
                displayQuizzes(quizzes);
                updateSidebar(quizzes);
                return;
            }
        }

        // Test database connection first
        const { data: testConnection, error: connectionError } = await supabase
            .from('tests')
            .select('count', { count: 'exact', head: true });

        if (connectionError) {
            console.error('Database connection error:', connectionError);
            throw new Error('Database connection failed');
        }

        let query = supabase
            .from('tests')
            .select('*')
            .order('created_at', { ascending: false });

        // Apply stream filter if provided
        if (streamFilter) {
            // Include tests with 'All' stream when filtering for specific streams
            query = query.or(`stream.eq.${streamFilter},stream.eq.All`);
        }

        const { data, error } = await query;

        if (error) throw error;

        quizzes = data || [];
        console.log('Loaded fresh quizzes from database:', quizzes.length);

        // Cache the quiz data
        localStorage.setItem(cacheKey, JSON.stringify(quizzes));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());

        displayQuizzes(quizzes);
        updateSidebar(quizzes);
    } catch (error) {
        console.error('Error loading quizzes:', error);
        const quizGrid = document.getElementById('quizGrid');
        if (quizGrid) {
            quizGrid.innerHTML = `
                <div class="error">
                    <i class="material-icons">error_outline</i>
                    <h3>Failed to load quizzes</h3>
                    <p>Please check your internet connection and try again.</p>
                    <button class="btn btn-primary" onclick="loadQuizzes()">Retry</button>
                </div>
            `;
        }
    }
}

function displayQuizzes(quizzesToShow) {
    const quizGrid = document.getElementById('quizGrid');

    if (!quizGrid) {
        // Quiz grid doesn't exist on this page (e.g., quiz.html), so return silently
        return;
    }

    if (!quizzesToShow || quizzesToShow.length === 0) {
        quizGrid.innerHTML = `
            <div class="empty-state">
                <i class="material-icons">quiz</i>
                <h3>No quizzes available</h3>
                <p>Check back later for new tests or contact support if this seems incorrect.</p>
            </div>
        `;
        return;
    }

    quizGrid.innerHTML = quizzesToShow.map(quiz => `
        <div class="quiz-card animate__animated animate__fadeInUp" onclick="openQuiz('${quiz.id}')">
            <div class="quiz-card-header">
                <i class="material-icons">assignment</i>
                <div class="quiz-difficulty">${quiz.stream || 'General'}</div>
            </div>
            <h3>${quiz.name}</h3>
            <p>${quiz.description || 'Comprehensive test covering all topics'}</p>
            <div class="quiz-meta">
                <div class="quiz-stats">
                    <span><i class="material-icons">timer</i> 3 hrs</span>
                    <span><i class="material-icons">quiz</i> 75 questions</span>
                    ${quiz.stream ? `<span><i class="material-icons">school</i> ${quiz.stream}</span>` : ''}
                </div>
                <div class="quiz-action">
                    <span>Take Quiz →</span>
                </div>
            </div>
        </div>
    `).join('');
}

function updateSidebar(quizzesToShow) {
    const sidebarQuizList = document.getElementById('sidebarQuizList');
    if (sidebarQuizList) {
        sidebarQuizList.innerHTML = quizzesToShow.map(quiz => `
            <div class="quiz-item" onclick="openQuiz('${quiz.id}')">
                <strong>${quiz.name}</strong>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px;">${quiz.description || 'No description'}</p>
            </div>
        `).join('');
    }
}

// Search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredQuizzes = quizzes.filter(quiz =>
                quiz.name.toLowerCase().includes(searchTerm) ||
                (quiz.description && quiz.description.toLowerCase().includes(searchTerm)) ||
                (quiz.stream && quiz.stream.toLowerCase().includes(searchTerm))
            );
            displayQuizzes(filteredQuizzes);
            updateSidebar(filteredQuizzes);
        });
    }
}

// Quiz functions
async function openQuiz(testId) {
    const hasAccess = await checkUserAccess();
    if (!hasAccess) {
        return;
    }

    window.location.href = `quiz.html?test_id=${testId}`;
}

async function loadQuizData() {
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('test_id');

    if (!testId) {
        alert('No quiz selected');
        window.location.href = 'index.html';
        return;
    }

    try {
        const { data: quiz, error: quizError } = await supabase
            .from('tests')
            .select('*')
            .eq('id', testId)
            .single();

        if (quizError) throw quizError;
        currentQuiz = quiz;

        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .eq('test_id', testId)
            .order('subject');

        if (questionsError) throw questionsError;
        questions = questionsData || [];

        initializeQuizInterface();

    } catch (error) {
        console.error('Error loading quiz:', error);
        alert('Failed to load quiz. Please try again.');
        window.location.href = 'index.html';
    }
}

function initializeQuizInterface() {
    document.title = `${currentQuiz.name} - Test Sagar`;

    quizStartTime = Date.now();
    startTimer();

    setupQuizNavigation();
    displayQuestion(0);
    setupKeyboardShortcuts();
}

function setupQuizNavigation() {
    const questionNav = document.querySelector('.question-nav');
    if (!questionNav) return;

    const subjects = ['Chemistry', 'Maths', 'Physics'];
    let navHTML = `
        <div class="nav-header">
            <div class="nav-title">
                <i class="material-icons">quiz</i>
                <h3>Question Navigation</h3>
            </div>
            <button class="nav-close" id="navCloseBtn">
                <i class="material-icons">close</i>
            </button>
        </div>
        <div class="nav-content">
            <div class="quiz-progress">
                <div class="progress-stats">
                    <div class="stat">
                        <span class="stat-value" id="answeredCount">0</span>
                        <span class="stat-label">Answered</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" id="remainingCount">${questions.length}</span>
                        <span class="stat-label">Remaining</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" id="markedCount">0</span>
                        <span class="stat-label">Marked</span>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar">
                        <div class="progress" id="overallProgress" style="width: 0%"></div>
                    </div>
                    <span class="progress-text" id="progressText">0% Complete</span>
                </div>
            </div>
            <div class="subjects-container">
    `;

    subjects.forEach(subject => {
        const subjectQuestions = questions.filter(q => q.subject === subject);
        if (subjectQuestions.length === 0) return;

        navHTML += `
            <div class="subject-section" data-subject="${subject}">
                <div class="subject-header" onclick="toggleSubjectSection('${subject}')">
                    <span>${subject} (${subjectQuestions.length} questions)</span>
                    <span class="toggle-icon">▼</span>
                </div>
                <div class="question-numbers">
                    ${subjectQuestions.map((q, index) => {
            const globalIndex = questions.findIndex(question => question.id === q.id);
            return `<button class="question-btn" data-question="${globalIndex}" onclick="goToQuestion(${globalIndex})">${globalIndex + 1}</button>`;
        }).join('')}
                </div>
            </div>
        `;
    });

    navHTML += `
            </div>
            <div class="legend">
                <h4>Legend</h4>
                <div class="legend-items">
                    <div class="legend-item">
                        <div class="legend-color current"></div>
                        <span>Current</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color answered"></div>
                        <span>Answered</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color marked"></div>
                        <span>Marked</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color skipped"></div>
                        <span>Skipped</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    questionNav.innerHTML = navHTML;
    updateQuizProgress();
}

function toggleSubjectSection(subject) {
    const section = document.querySelector(`[data-subject="${subject}"]`);
    if (section) {
        section.classList.toggle('expanded');
        const icon = section.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = section.classList.contains('expanded') ? '▲' : '▼';
        }

        // Animate the toggle
        const questionNumbers = section.querySelector('.question-numbers');
        if (questionNumbers) {
            if (section.classList.contains('expanded')) {
                questionNumbers.style.maxHeight = questionNumbers.scrollHeight + 'px';
            } else {
                questionNumbers.style.maxHeight = '0px';
            }
        }
    }
}

function setupQuizHeader() {
    const hamburger = document.querySelector('.quiz-header .hamburger');
    const questionNav = document.querySelector('.question-nav');

    if (hamburger && questionNav) {
        hamburger.addEventListener('click', () => {
            questionNav.classList.toggle('open');
        });

        // Enhanced touch gestures for mobile
            let touchStartX = 0;
            let touchEndX = 0;
            let touchStartY = 0;
            let touchEndY = 0;
            let touchStartTime = 0;

            document.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
                touchStartTime = Date.now();
            }, { passive: true });

            document.addEventListener('touchend', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                handleSwipe();
            }, { passive: true });

            function handleSwipe() {
                const swipeThreshold = 60;
                const swipeDistance = touchEndX - touchStartX;
                const verticalDistance = Math.abs(touchEndY - touchStartY);
                const touchDuration = Date.now() - touchStartTime;

                // Only handle horizontal swipes that are fast enough and not too vertical
                if (verticalDistance > swipeThreshold || touchDuration > 300) return;

                // Swipe right to open sidebar (when closed)
                if (swipeDistance > swipeThreshold && !questionNav.classList.contains('open') && touchStartX < 80) {
                    e.preventDefault();
                    openSidebar();
                }

                // Swipe left to close sidebar (when open)
                if (swipeDistance < -swipeThreshold && questionNav.classList.contains('open')) {
                    e.preventDefault();
                    closeSidebar();
                }
            }

        // Close nav when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (!questionNav.contains(e.target) && !hamburger.contains(e.target)) {
                questionNav.classList.remove('open');
            }
        });
    }
}

function startTimer() {
    const timerElement = document.querySelector('.timer');
    if (!timerElement) return;

    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - quizStartTime) / 1000);
        timerElement.textContent = formatTime(elapsed);
    }, 1000);
}

function displayQuestion(index) {
    if (index < 0 || index >= questions.length) return;

    currentQuestionIndex = index;
    const question = questions[index];

    updateQuestionNavigation();

    const questionContent = document.querySelector('.question-content');
    if (!questionContent) return;

    // Create question text if available
    const questionText = question.question_text || `Question ${index + 1}`;

    questionContent.innerHTML = `
        <div class="question-header">
            <div class="question-number">Question ${index + 1} of ${questions.length}</div>
            <div class="subject-badge">${question.subject}</div>
        </div>

        <div class="question-body">
            <div class="question-text">
                <p>${questionText}</p>
            </div>

            ${question.image ? `<img src="${question.image}" alt="Question image" class="question-image" onerror="this.style.display='none'">` : ''}

            <div class="question-options">
                ${question.type === 'mcq' ? renderMCQOptions(question, index) : renderIntegerInput(question, index)}
            </div>
        </div>

        <div class="question-actions">
            <button class="btn btn-secondary" onclick="skipQuestion()">Skip</button>
            <button class="btn btn-secondary" onclick="clearAnswer()">Clear</button>
            <button class="btn btn-warning" onclick="toggleMarkForReview()">${markedQuestions.has(index) ? 'Unmark' : 'Mark for Review'}</button>
            <button class="btn btn-primary" onclick="saveAndNext()">Save & Next</button>
        </div>
    `;
}

function renderMCQOptions(question, questionIndex) {
    // Parse options if they're stored as JSON string
    let options;
    try {
        if (typeof question.options === 'string' && question.options.trim() !== '') {
            options = JSON.parse(question.options);
        } else if (Array.isArray(question.options) && question.options.length > 0) {
            options = question.options;
        } else {
            // Default options for MCQ questions
            options = ['A', 'B', 'C', 'D'];
        }
    } catch (e) {
        console.error('Error parsing options:', e);
        options = ['A', 'B', 'C', 'D'];
    }

    // Ensure we have at least some options
    if (!options || options.length === 0) {
        options = ['A', 'B', 'C', 'D'];
    }

    const currentAnswer = userAnswers[questionIndex];

    return `
        <div class="options">
            ${options.map((option, optIndex) => `
                <label class="option ${currentAnswer === option ? 'selected' : ''}" onclick="selectOption('${option}', ${questionIndex})">
                    <input type="radio" name="question_${questionIndex}" value="${option}" ${currentAnswer === option ? 'checked' : ''} style="display: none;">
                    <span class="option-letter">${String.fromCharCode(65 + optIndex)}</span>
                    <span class="option-text">${option}</span>
                </label>
            `).join('')}
        </div>
    `;
}

function renderIntegerInput(question, questionIndex) {
    const currentAnswer = userAnswers[questionIndex] || '';

    return `
        <div class="integer-answer">
            <label for="integer_${questionIndex}">Enter your answer:</label>
            <input type="number" id="integer_${questionIndex}" class="integer-input" value="${currentAnswer}" 
                   onchange="setIntegerAnswer(this.value, ${questionIndex})" 
                   placeholder="Enter integer value">
        </div>
    `;
}

function selectOption(option, questionIndex) {
    userAnswers[questionIndex] = option;

    const options = document.querySelectorAll('.option');
    options.forEach(opt => opt.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    updateQuestionNavigation();
}

function setIntegerAnswer(value, questionIndex) {
    if (value.trim() === '') {
        delete userAnswers[questionIndex];
    } else {
        userAnswers[questionIndex] = value.trim();
    }
    updateQuestionNavigation();
}

function updateQuestionNavigation() {
    const questionBtns = document.querySelectorAll('.question-btn');
    questionBtns.forEach((btn, index) => {
        btn.classList.remove('current', 'answered', 'marked', 'skipped');

        if (index === currentQuestionIndex) {
            btn.classList.add('current');
        }

        if (userAnswers.hasOwnProperty(index)) {
            btn.classList.add('answered');
        }

        if (markedQuestions.has(index)) {
            btn.classList.add('marked');
        }
    });

    updateQuizProgress();
}

function updateQuizProgress() {
    const totalQuestions = questions.length;
    const answeredCount = Object.keys(userAnswers).length;
    const markedCount = markedQuestions.size;
    const remainingCount = totalQuestions - answeredCount;
    const progressPercentage = Math.round((answeredCount / totalQuestions) * 100);

    // Update progress stats
    const answeredCountEl = document.getElementById('answeredCount');
    const remainingCountEl = document.getElementById('remainingCount');
    const markedCountEl = document.getElementById('markedCount');
    const overallProgressEl = document.getElementById('overallProgress');
    const progressTextEl = document.getElementById('progressText');

    if (answeredCountEl) answeredCountEl.textContent = answeredCount;
    if (remainingCountEl) remainingCountEl.textContent = remainingCount;
    if (markedCountEl) markedCountEl.textContent = markedCount;
    if (overallProgressEl) overallProgressEl.style.width = `${progressPercentage}%`;
    if (progressTextEl) progressTextEl.textContent = `${progressPercentage}% Complete`;
}

function goToQuestion(index) {
    displayQuestion(index);

    const questionNav = document.querySelector('.question-nav');
    if (window.innerWidth <= 768 && questionNav) {
        questionNav.classList.remove('open');
    }
}

function skipQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        displayQuestion(currentQuestionIndex + 1);
    }
}

function clearAnswer() {
    delete userAnswers[currentQuestionIndex];
    displayQuestion(currentQuestionIndex);
}

function toggleMarkForReview() {
    if (markedQuestions.has(currentQuestionIndex)) {
        markedQuestions.delete(currentQuestionIndex);
    } else {
        markedQuestions.add(currentQuestionIndex);
    }
    updateQuestionNavigation();

    const markBtn = document.querySelector('.btn-warning');
    if (markBtn) {
        markBtn.textContent = markedQuestions.has(currentQuestionIndex) ? 'Unmark' : 'Mark for Review';
    }
}

function saveAndNext() {
    if (currentQuestionIndex < questions.length - 1) {
        displayQuestion(currentQuestionIndex + 1);
    } else {
        if (confirm('This is the last question. Do you want to submit the quiz?')) {
            submitQuiz();
        }
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.type === 'number' || e.target.type === 'text') return;

        switch (e.key) {
            case 'ArrowLeft':
                if (currentQuestionIndex > 0) {
                    displayQuestion(currentQuestionIndex - 1);
                }
                break;
            case 'ArrowRight':
                if (currentQuestionIndex < questions.length - 1) {
                    displayQuestion(currentQuestionIndex + 1);
                }
                break;
            case '1':
            case '2':
            case '3':
            case '4':
                const question = questions[currentQuestionIndex];
                if (question.type === 'mcq') {
                    const optionIndex = parseInt(e.key) - 1;
                    const options = question.options || ['A', 'B', 'C', 'D'];
                    if (optionIndex < options.length) {
                        selectOption(options[optionIndex], currentQuestionIndex);
                    }
                }
                break;
            case 'Enter':
                saveAndNext();
                break;
            case 'Escape':
                const questionNav = document.querySelector('.question-nav');
                if (questionNav) {
                    questionNav.classList.toggle('open');
                }
                break;
        }
    });
}

async function submitQuiz() {
    if (!confirm('Are you sure you want to submit the quiz? You cannot change your answers after submission.')) {
        return;
    }

    const results = calculateResults();

    await saveTestResult(currentQuiz, userAnswers, results);

    localStorage.setItem('quiz_results', JSON.stringify({
        quiz: currentQuiz,
        questions: questions,
        userAnswers: userAnswers,
        markedQuestions: Array.from(markedQuestions),
        results: results,
        completedAt: new Date().toISOString()
    }));

    window.location.href = 'result.html';
}

function calculateResults() {
    let correct = 0;
    let incorrect = 0;
    let skipped = 0;

    const subjectStats = {
        Physics: { correct: 0, incorrect: 0, skipped: 0, total: 0 },
        Chemistry: { correct: 0, incorrect: 0, skipped: 0, total: 0 },
        Maths: { correct: 0, incorrect: 0, skipped: 0, total: 0 }
    };

    const correctQuestions = [];
    const incorrectQuestions = [];
    const skippedQuestions = [];

    questions.forEach((question, index) => {
        const subject = question.subject;
        subjectStats[subject].total++;

        if (!userAnswers.hasOwnProperty(index)) {
            skipped++;
            subjectStats[subject].skipped++;
            skippedQuestions.push(index + 1);
        } else if (userAnswers[index] === question.correct) {
            correct++;
            subjectStats[subject].correct++;
            correctQuestions.push(index + 1);
        } else {
            incorrect++;
            subjectStats[subject].incorrect++;
            incorrectQuestions.push(index + 1);
        }
    });

    const total = questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
        correct,
        incorrect,
        skipped,
        total,
        percentage,
        subjectStats,
        correctQuestions,
        incorrectQuestions,
        skippedQuestions
    };
}

async function saveTestResult(quizData, userAnswers, results) {
    if (!currentUser) return;

    try {
        const testResult = {
            user_id: currentUser.id,
            test_id: quizData.id,
            test_name: quizData.name,
            correct: results.correct,
            incorrect: results.incorrect,
            skipped: results.skipped,
            total: results.total,
            percentage: results.percentage,
            subject_stats: JSON.stringify(results.subjectStats),
            completed_at: new Date().toISOString(),
            time_taken: Math.floor((Date.now() - quizStartTime) / 1000)
        };

        const { error } = await supabase
            .from('test_results')
            .insert(testResult);

        if (error) throw error;

        console.log('Test result saved successfully');
    } catch (error) {
        console.error('Error saving test result:', error);
    }
}

async function loadResults() {
    const resultsData = localStorage.getItem('quiz_results');
    if (!resultsData) {
        alert('No quiz results found.');
        window.location.href = 'index.html';
        return;
    }

    const data = JSON.parse(resultsData);
    displayResults(data);
}

function displayResults(data) {
    const { quiz, results, completedAt } = data;

    document.title = `${quiz.name} - Results - Test Sagar`;

    const resultContainer = document.querySelector('.result-container');
    if (resultContainer) {
        resultContainer.innerHTML = `
            <div class="result-header">
                <div class="result-icon">🎉</div>
                <h1>Quiz Completed!</h1>
                <h2>${quiz.name}</h2>
                <p>Completed on ${new Date(completedAt).toLocaleString()}</p>
            </div>

            <div class="score-summary">
                <div class="score-circle">
                    <div class="score-value">${results.percentage}%</div>
                    <div class="score-label">Overall Score</div>
                </div>
                <div class="score-breakdown">
                    <div class="score-item correct">
                        <div class="score-count">${results.correct}</div>
                        <div class="score-text">Correct</div>
                    </div>
                    <div class="score-item incorrect">
                        <div class="score-count">${results.incorrect}</div>
                        <div class="score-text">Incorrect</div>
                    </div>
                    <div class="score-item skipped">
                        <div class="score-count">${results.skipped}</div>
                        <div class="score-text">Skipped</div>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><i class="material-icons">analytics</i> Subject-wise Analysis</h3>
                <div class="subject-analysis">
                    ${Object.entries(results.subjectStats).map(([subject, stats]) => {
            const percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
            return `
                            <div class="subject-card">
                                <div class="subject-header">
                                    <h4>${subject}</h4>
                                    <span class="subject-percentage">${percentage}%</span>
                                </div>
                                <div class="subject-progress">
                                    <div class="progress-bar">
                                        <div class="progress" style="width: ${percentage}%"></div>
                                    </div>
                                </div>
                                <div class="subject-stats">
                                    <span>✓ ${stats.correct}</span>
                                    <span>✗ ${stats.incorrect}</span>
                                    <span>⚬ ${stats.skipped}</span>
                                    <span>Total: ${stats.total}</span>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>

            <div class="result-actions">
                <button class="btn btn-primary" onclick="reviewAnswers()">
                    <i class="material-icons">visibility</i> Review Answers
                </button>
                <button class="btn btn-secondary" onclick="retakeQuiz()">
                    <i class="material-icons">refresh</i> Retake Quiz
                </button>
                <button class="btn btn-outline" onclick="goHome()">
                    <i class="material-icons">home</i> Home
                </button>
            </div>
        `;
    }
}

function reviewAnswers() {
    // Check if quiz results exist
    const resultsData = localStorage.getItem('quiz_results');
    if (resultsData) {
        window.location.href = 'review.html';
    } else {
        alert('No quiz results found. Please take a quiz first.');
        window.location.href = 'index.html';
    }
}

function retakeQuiz() {
    const resultsData = localStorage.getItem('quiz_results');
    if (resultsData) {
        const data = JSON.parse(resultsData);
        window.location.href = `quiz.html?test_id=${data.quiz.id}`;
    }
}

function goHome() {
    window.location.href = 'index.html';
}

function cleanup() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
}

window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);

async function enforceGlobalAccess() {
    if (window.location.pathname.includes('uploader.html')) {
        return true;
    }

    try {
        await initializeUser();
        const hasAccess = await checkUserAccess();

        if (!hasAccess) {
            const body = document.body;
            const premiumModal = document.getElementById('premiumModal');

            Array.from(body.children).forEach(child => {
                if (child !== premiumModal && !child.id.includes('premiumModal')) {
                    child.style.display = 'none';
                }
            });

            return false;
        }

        return true;
    } catch (error) {
        console.error('Error enforcing access:', error);
        return false;
    }
}

async function validateAccess() {
    if (!currentUser || !userSession) {
        return false;
    }

    const { data: trial } = await supabase
        .from('user_trials')
        .select('start_date')
        .eq('user_id', currentUser.id)
        .single();

    if (trial) {
        const startDate = new Date(trial.start_date);
        const threeDaysLater = new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000));
        const now = new Date();

        if (now <= threeDaysLater) {
            return 'trial';
        }
    }

    const { data: premium } = await supabase
        .from('premium_users')
        .select('expiry_date')
        .eq('user_id', currentUser.id)
        .single();

    if (premium) {
        const expiryDate = new Date(premium.expiry_date);
        const now = new Date();

        if (now <= expiryDate) {
            return 'premium';
        }
    }

    return false;
}

// Sidebar setup function
function setupSidebar() {
    // This function can be used for sidebar initialization if needed
    console.log('Sidebar setup complete');
}

// Initialize setupSidebar when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (typeof setupSidebar === 'function') {
        setupSidebar();
    }
});

async function retryPaymentActivation(paymentId) {
    try {
        const premiumModal = document.getElementById('premiumModal');
        if (premiumModal) {
            premiumModal.querySelector('.premium-content').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2 style="color: var(--secondary);">🔄 Retrying Activation</h2>
                    <p>Processing your premium access...</p>
                    <div style="margin: 1rem 0;">
                        <div style="width: 40px; height: 40px; border: 4px solid var(--light-gray); border-top: 4px solid var(--secondary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                    </div>
                </div>
            `;
        }

        // Ensure user session is valid
        if (!userSession || !currentUser) {
            throw new Error('User session is invalid. Please refresh and try again.');
        }

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1);

        // Delete any existing trial record to prevent conflicts
        const { error: deleteError } = await supabase
            .from('user_trials')
            .delete()
            .eq('user_id', currentUser.id);

        if (deleteError) {
            console.log('Note: No trial record to delete or delete failed:', deleteError.message);
        } else {
            console.log('Trial record deleted successfully during retry');
        }

        // Try to add to premium users again
        const { data: premiumData, error: premiumError } = await supabase
            .from('premium_users')
            .upsert({
                user_id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name,
                payment_id: paymentId,
                expiry_date: expiryDate.toISOString(),
                start_date: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select();

        if (premiumError) {
            console.error('Premium retry error:', premiumError);
            throw new Error(`Failed to activate premium: ${premiumError.message}`);
        }

        accessStatus = 'premium';

        // Show success message
        if (premiumModal) {
            premiumModal.querySelector('.premium-content').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2 style="color: var(--secondary);">🎉 Success!</h2>
                    <p style="color: var(--text-primary);">Premium access activated successfully!</p>
                    <p style="color: var(--text-secondary); margin: 1rem 0;">Payment ID: ${paymentId}</p>
                    <button onclick="window.location.reload()" style="background: var(--secondary);color: white; border:none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; margin-top: 1rem;">Continue</button>
                </div>
            `;
        }

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error('Retry activation error:', error);
        const premiumModal = document.getElementById('premiumModal');
        if (premiumModal) {
            premiumModal.querySelector('.premium-content').innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <h2 style="color: var(--danger);">⚠️ Retry Failed</h2>
                    <p>Still unable to activate premium access.</p>
                    <p style="color: var(--text-secondary); margin: 1rem 0;">Payment ID: ${paymentId}</p>
                    <p style="color: var(--text-secondary);">Error: ${error.message}</p>
                    <p style="color: var(--text-secondary); margin-top: 1rem;">Please contact support with the above payment ID.</p>
                    <button onclick="window.location.reload()" style="background: var(--secondary); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; margin-top: 1rem;">Continue</button>
                </div>
            `;
        }
    }
}

// Global profile cache variables
let profileDataCache = null;
let profileCacheTimestamp = null;

// Load user profile information with persistent caching
async function loadUserProfile(forceRefresh = false) {
    if (!currentUser) {
        console.log('No current user, skipping profile load');
        return;
    }

    const cacheKey = `profile_data_${currentUser.id}`;
    const cacheTimestampKey = `${cacheKey}_timestamp`;

    // Check if we should use cached data
    if (!forceRefresh) {
        // First check in-memory cache
        if (profileDataCache && profileCacheTimestamp) {
            const age = Date.now() - profileCacheTimestamp;
            const thirtyMinutes = 30 * 60 * 1000; // Cache for 30 minutes in memory

            if (age < thirtyMinutes) {
                console.log('Using in-memory profile cache');
                updateProfileElementsDirectly(profileDataCache);
                return;
            }
        }

        // Then check localStorage cache  
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTimestamp = localStorage.getItem(cacheTimestampKey);

        if (cachedData && cacheTimestamp) {
            const age = Date.now() - parseInt(cacheTimestamp);
            const oneHour = 60 * 60 * 1000; // Cache in localStorage for 1 hour

            if (age < oneHour) {
                console.log('Using localStorage profile cache');
                const parsed = JSON.parse(cachedData);

                // Update global variables from cache
                currentUser.name = parsed.name;
                currentUser.email = parsed.email;
                accessStatus = parsed.accessStatus;
                userAnalytics = parsed.userAnalytics;

                // Update in-memory cache
                profileDataCache = parsed;
                profileCacheTimestamp = parseInt(cacheTimestamp);

                // Update UI immediately
                updateProfileElementsDirectly(parsed);
                return;
            }
        }
    }

    console.log('Loading fresh profile data from database...');

    try {
        // Fetch ALL profile data in parallel
        const [userProfileResult, premiumResult, trialResult, analyticsResult] = await Promise.allSettled([
            supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', currentUser.id)
                .single(),

            supabase
                .from('premium_users')
                .select('*')
                .eq('user_id', currentUser.id)
                .single(),

            supabase
                .from('user_trials')
                .select('*')
                .eq('user_id', currentUser.id)
                .single(),

            supabase
                .from('test_results')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('completed_at', { ascending: false })
        ]);

        // Process user profile data
        if (userProfileResult.status === 'fulfilled' && userProfileResult.value.data) {
            const profileData = userProfileResult.value.data;
            currentUser.name = profileData.name || currentUser.name || 'User';
            currentUser.email = profileData.email || currentUser.email || 'No email';
        } else {
            currentUser.name = currentUser.name || userSession?.user?.user_metadata?.full_name || userSession?.user?.email || 'User';
            currentUser.email = currentUser.email || userSession?.user?.email || 'No email';
        }

        // Process subscription status
        let daysLeft = 0;
        let statusText = 'No Active Subscription';
        let statusClass = 'expired';

        // Check premium status first
        if (premiumResult.status === 'fulfilled' && premiumResult.value.data) {
            const premium = premiumResult.value.data;
            const expiryDate = new Date(premium.expiry_date);
            const now = new Date();
            const remainingTime = expiryDate - now;
            daysLeft = Math.max(0, Math.ceil(remainingTime / (24 * 60 * 60 * 1000)));

            if (daysLeft > 0) {
                statusText = `Premium Active`;
                statusClass = 'premium';
                accessStatus = 'premium';
            } else {
                statusText = 'Premium Expired';
                statusClass = 'expired';
                accessStatus = 'expired';
            }
        } else if (trialResult.status === 'fulfilled' && trialResult.value.data) {
            const trial = trialResult.value.data;
            const startDate = new Date(trial.start_date);
            const threeDaysLater = new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000));
            const now = new Date();
            const remainingTime = threeDaysLater - now;
            daysLeft = Math.max(0, Math.ceil(remainingTime / (24 * 60 * 60 * 1000)));

            if (daysLeft > 0) {
                statusText = `Trial Active`;
                statusClass = 'trial';
                accessStatus = 'trial';
            } else {
                statusText = 'Trial Expired';
                statusClass = 'expired';
                accessStatus = 'expired';
            }
        }

        // Process analytics data
        if (analyticsResult.status === 'fulfilled' && analyticsResult.value.data) {
            calculateUserAnalytics(analyticsResult.value.data);
        } else {
            userAnalytics = {
                totalTests: 0,
                totalCorrect: 0,
                totalQuestions: 0,
                accuracy: 0,
                completionRate: 0,
                percentile: 0,
                subjectStats: {},
                recentTests: [],
                improvementTrend: []
            };
        }

        const finalProfileData = {
            name: currentUser.name,
            email: currentUser.email,
            statusText,
            statusClass,
            daysLeft,
            accessStatus,
            userAnalytics,
            testsData: {
                totalTests: userAnalytics.totalTests || 0,
                accuracy: userAnalytics.accuracy || 0
            }
        };

        // Cache the data
        const timestamp = Date.now();
        localStorage.setItem(cacheKey, JSON.stringify(finalProfileData));
        localStorage.setItem(cacheTimestampKey, timestamp.toString());

        // Update in-memory cache
        profileDataCache = finalProfileData;
        profileCacheTimestamp = timestamp;

        console.log('Profile data loaded and cached successfully');

        // Update UI
        updateProfileElementsDirectly(finalProfileData);

    } catch (error) {
        console.error('Error loading profile:', error);

        // Clear invalid cache
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(cacheTimestampKey);
        profileDataCache = null;
        profileCacheTimestamp = null;

        updateProfileElementsDirectly({
            name: 'Error Loading Profile',
            email: 'Please refresh the page',
            statusText: 'Error Loading Status',
            statusClass: 'error',
            daysLeft: 0,
            testsData: { totalTests: 0, accuracy: 0 }
        });
    }
}

// Function to invalidate profile cache (call this when user data changes)
function invalidateProfileCache() {
    if (currentUser) {
        const cacheKey = `profile_data_${currentUser.id}`;
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(`${cacheKey}_timestamp`);
        profileDataCache = null;
        profileCacheTimestamp = null;
        console.log('Profile cache invalidated');
    }
}

// Function to force refresh profile data
async function refreshProfileData() {
    console.log('Force refreshing profile data...');
    await loadUserProfile(true);
}

function showFullProfileLoadingState() {
    const profilePage = document.getElementById('profile-page');
    if (profilePage) {
        // Hide all existing content first
        const existingContent = profilePage.innerHTML;
        profilePage.setAttribute('data-original-content', existingContent);

        // Create full screen loading state
        profilePage.innerHTML = `
            <div id="profileLoadingOverlay" style="
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100vh;
                background: var(--bg-primary);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                border-radius: 16px;
            ">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 1.5rem; text-align: center;">
                    <div style="width: 60px; height: 60px; border: 4px solid var(--light-gray); border-top: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <div>
                        <h3 style="color: var(--text-primary); margin: 0 0 0.5rem 0; font-size: 1.5rem;">Loading Your Profile</h3>
                        <p style="color: var(--text-secondary); margin: 0; font-size: 1rem;">Fetching all data from database...</p>
                        <div style="margin-top: 1rem;">
                            <div style="width: 200px; height: 4px; background: var(--light-gray); border-radius: 2px; overflow: hidden;">
                                <div style="width: 100%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary), var(--primary)); animation: loading-bar 2s ease-in-out infinite;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes loading-bar {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            </style>
        `;

        // Make profile page relative for overlay positioning
        profilePage.style.position = 'relative';
    }
}

function hideProfileLoadingState() {
    const profilePage = document.getElementById('profile-page');
    if (profilePage) {
        const originalContent = profilePage.getAttribute('data-original-content');
        if (originalContent) {
            profilePage.innerHTML = originalContent;
            profilePage.removeAttribute('data-original-content');
        } else {
            // Fallback: just remove the loading overlay
            const loadingOverlay = document.getElementById('profileLoadingOverlay');
            if (loadingOverlay) {
                loadingOverlay.remove();
            }
        }
    }
}

function updateProfileElementsDirectly({ name, email, statusText, statusClass, daysLeft, testsData }) {
    console.log('Updating profile elements with:', { name, email, statusText, statusClass, daysLeft, testsData });

    // Update elements immediately without retries for faster loading
    const updateElements = () => {
        // Update profile name
        const profileName = document.querySelector('#profileName');
        if (profileName) {
            profileName.textContent = name || 'User';
        }

        // Update profile email  
        const profileEmail = document.querySelector('#profileEmail');
        if (profileEmail) {
            profileEmail.textContent = email || 'Loading email...';
        }

        // Update subscription status
        const statusBadge = document.querySelector('#statusBadge');
        if (statusBadge) {
            statusBadge.textContent = statusText || 'Checking status...';
            statusBadge.className = `status-badge ${statusClass || 'loading'}`;
        }

        // Update individual profile stat elements with immediate fallback values
        const profileDaysLeft = document.getElementById('profileDaysLeft');
        const profileTestsTaken = document.getElementById('profileTestsTaken');
        const profileAvgScore = document.getElementById('profileAvgScore');

        if (profileDaysLeft) {
            profileDaysLeft.textContent = daysLeft !== undefined ? daysLeft :
                accessStatus === 'premium' ? '30' :
                    accessStatus === 'trial' ? '3' : '0';
        }
        if (profileTestsTaken) {
            profileTestsTaken.textContent = (testsData && testsData.totalTests !== undefined) ? testsData.totalTests : '0';
        }
        if (profileAvgScore) {
            profileAvgScore.textContent = `${(testsData && testsData.accuracy !== undefined) ? testsData.accuracy : 0}%`;
        }

        // Update account information with immediate values
        updateAccountInformation();

        // Also update welcome message if on homepage
        updateWelcomeMessage();

        console.log('Profile elements updated successfully');
    };

    // Execute immediately
    updateElements();

    // Also try again after a short delay in case elements weren't ready
    setTimeout(updateElements, 100);
}

// Profile functionality functions
function toggleEditProfile() {
    const editForm = document.getElementById('editProfileForm');
    const editBtn = document.getElementById('editProfileBtn');

    if (editForm.style.display === 'none' || !editForm.style.display) {
        // Show edit form
        editForm.style.display = 'block';
        editBtn.style.display = 'none';

        // Populate current values
        document.getElementById('editName').value = currentUser?.name || '';
        document.getElementById('editEmail').value = currentUser?.email || '';
    } else {
        // Hide edit form
        editForm.style.display = 'none';
        editBtn.style.display = 'block';
    }
}

function cancelEdit() {
    const editForm = document.getElementById('editProfileForm');
    const editBtn = document.getElementById('editProfileBtn');

    editForm.style.display = 'none';
    editBtn.style.display = 'block';
}

async function saveProfile() {
    const newName = document.getElementById('editName').value.trim();

    if (!newName) {
        alert('Please enter your name');
        return;
    }

    // Show loading state
    const saveBtn = document.querySelector('#editProfileForm .btn-primary');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        const success = await updateUserProfileNameOnly(newName);

        if (success) {
            // Update UI immediately
            document.getElementById('profileName').textContent = newName;
            updateWelcomeMessage();

            // Hide edit form
            cancelEdit();

            // Invalidate cache to force refresh
            invalidateProfileCache();

            alert('Profile updated successfully!');
        } else {
            alert('Failed to update profile. Please try again.');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error updating profile. Please try again.');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function updateAccountInformation() {
    // Update member since date
    const memberSinceEl = document.getElementById('memberSince');
    if (memberSinceEl) {
        if (userSession?.user?.created_at) {
            const createdDate = new Date(userSession.user.created_at);
            memberSinceEl.textContent = createdDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else {
            // Provide a reasonable fallback
            memberSinceEl.textContent = new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    // Update last login
    const lastLoginEl = document.getElementById('lastLogin');
    if (lastLoginEl) {
        lastLoginEl.textContent = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Calculate total study time based on test results
    const totalStudyTimeEl = document.getElementById('totalStudyTime');
    if (totalStudyTimeEl) {
        if (userAnalytics?.totalTests && userAnalytics.totalTests > 0) {
            // Estimate 3 hours per test
            const estimatedHours = userAnalytics.totalTests * 3;
            totalStudyTimeEl.textContent = `${estimatedHours} hours`;
        } else {
            totalStudyTimeEl.textContent = '0 hours';
        }
    }
}

// Update welcome message on the homepage
function updateWelcomeMessage() {
    if (currentUser && currentUser.name) {
        const welcomeElement = document.getElementById('welcomeUserName');
        if (welcomeElement) {
            welcomeElement.textContent = currentUser.name + '!';
        }
    }
}

// Enhanced navigation functions
function showPage(pageId, navItem) {
    // Hide all pages with fade out animation
    document.querySelectorAll('.page').forEach(page => {
        if (page.classList.contains('active')) {
            page.classList.add('animate__animated', 'animate__fadeOut');
            setTimeout(() => {
                page.classList.remove('active', 'animate__animated', 'animate__fadeOut');
            }, 300);
        }
    });

    // Show selected page with fade in animation
    setTimeout(async () => {
        const page = document.getElementById(pageId);
        page.classList.add('active', 'animate__animated', 'animate__fadeIn');

        // Update nav items
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            navItem.classList.add('active');
        }

        // Load page-specific data
        if (pageId === 'analytics-page') {
            console.log('Loading analytics data for analytics page...');
            await loadUserAnalytics();
        } else if (pageId === 'profile-page') {
            // Load profile data immediately when profile page is shown
            console.log('Profile page activated, loading data...');
            setTimeout(async () => {
                if (currentUser) {
                    await loadUserProfile(true); // Force refresh profile data
                } else {
                    console.log('No current user, initializing...');
                    await initializeUser();
                    if (currentUser) {
                        await loadUserProfile(true);
                    }
                }
            }, 100);
        } else if (pageId === 'test-list-page') {
            // Check access and load all tests when navigating to test list page
            const hasAccess = await checkUserAccess();
            if (hasAccess) {
                document.getElementById('test-list-title').textContent = 'All Tests';
                await loadQuizzes(); // Load all quizzes without filter
            }
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }, 300);
}

// Function to show test list filtered by stream
async function showTestList(streamName) {
    // Check access first
    const hasAccess = await checkUserAccess();
    if (!hasAccess) {
        return;
    }

    // Show the test list page
    document.getElementById('test-list-title').textContent = streamName;
    showPage('test-list-page');

    // Load quizzes for the specific stream
    await loadQuizzes(streamName);
}

// Function to show all tests
async function showAllTests() {
    // Check access first
    const hasAccess = await checkUserAccess();
    if (!hasAccess) {
        return;
    }

    // Show the test list page
    document.getElementById('test-list-title').textContent = 'All Tests';
    showPage('test-list-page');

    // Load all quizzes without filter
    await loadQuizzes();
}

async function showUserProfile() {
    // Pre-fill with basic data immediately to avoid loading states
    updateProfileElementsDirectly({
        name: currentUser?.name || 'User',
        email: currentUser?.email || 'Loading...',
        statusText: accessStatus === 'premium' ? 'Premium Active' :
            accessStatus === 'trial' ? 'Trial Active' :
                accessStatus === 'expired' ? 'Access Expired' : 'Loading...',
        statusClass: accessStatus || 'loading',
        daysLeft: 0,
        testsData: { totalTests: userAnalytics?.totalTests || 0, accuracy: userAnalytics?.accuracy || 0 }
    });

    // Show the profile page
    showPage('profile-page', document.querySelector('.nav-item:last-child'));

    // Load fresh data in background if needed
    if (currentUser) {
        if (profileDataCache && profileCacheTimestamp) {
            const age = Date.now() - profileCacheTimestamp;
            if (age < 10 * 60 * 1000) { // 10 minutes cache
                console.log('Using cached profile data for profile page');
                updateProfileElementsDirectly(profileDataCache);
                return;
            }
        }

        console.log('Loading fresh profile data...');
        await loadUserProfile(true); // Force refresh
    }
}

// Function to refresh analytics data
async function refreshAnalyticsData() {
    console.log('Refreshing analytics data...');

    // Show loading state
    const refreshBtn = document.querySelector('.btn-primary');
    if (refreshBtn && refreshBtn.textContent.includes('Refresh')) {
        const originalText = refreshBtn.textContent;
        refreshBtn.textContent = 'Refreshing...';
        refreshBtn.disabled = true;

        try {
            // Force refresh analytics data
            await loadUserAnalytics();

            // Force refresh profile data as well
            await loadUserProfile(true);

            console.log('Analytics data refreshed successfully');
        } catch (error) {
            console.error('Error refreshing analytics:', error);
        } finally {
            refreshBtn.textContent = originalText;
            refreshBtn.disabled = false;
        }
    } else {
        // If button not found, just refresh the data
        await loadUserAnalytics();
        await loadUserProfile(true);
    }
}

// Export functions for global access
window.openQuiz = openQuiz;
window.loadQuizData = loadQuizData;
window.setupQuizHeader = setupQuizHeader;
window.toggleSubjectSection = toggleSubjectSection;
window.goToQuestion = goToQuestion;
window.selectOption = selectOption;
window.setIntegerAnswer = setIntegerAnswer;
window.skipQuestion = skipQuestion;
window.clearAnswer = clearAnswer;
window.toggleMarkForReview = toggleMarkForReview;
window.saveAndNext = saveAndNext;
window.submitQuiz = submitQuiz;
window.loadResults = loadResults;
window.reviewAnswers = reviewAnswers;
window.retakeQuiz = retakeQuiz;
window.goHome = goHome;
window.initializeUser = initializeUser;
window.loadQuizzes = loadQuizzes;
window.showTestList = showTestList;
window.setupSearch = setupSearch;
window.setupSidebar = setupSidebar;
window.checkGlobalAccess = checkGlobalAccess;
window.checkUserAccess = checkUserAccess;
window.showPremiumModal = showPremiumModal;
window.initiatePremiumPayment = initiatePremiumPayment;
window.handlePaymentSuccess = handlePaymentSuccess;
window.enforceGlobalAccess = enforceGlobalAccess;
window.validateAccess = validateAccess;
window.loadUserAnalytics = loadUserAnalytics;
window.updateAnalyticsDisplay = updateAnalyticsDisplay;
window.retryPaymentActivation = retryPaymentActivation;
window.updateUserProfile = updateUserProfile;
window.updateUserProfileNameOnly = updateUserProfileNameOnly;
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;
window.logout = logout;
window.loadUserProfile = loadUserProfile;
window.updateWelcomeMessage = updateWelcomeMessage;
window.showUserProfile = showUserProfile;
window.showAllTests = showAllTests;
window.showPage = showPage;
window.invalidateProfileCache = invalidateProfileCache;
window.clearAllCache = clearAllCache;
window.toggleEditProfile = toggleEditProfile;
window.cancelEdit = cancelEdit;
window.saveProfile = saveProfile;
window.refreshAnalyticsData = refreshAnalyticsData;

// Function to show test list filtered by stream
async function showTestList(streamName) {
    // Check access first
    const hasAccess = await checkUserAccess();
    if (!hasAccess) {
        return;
    }

    // Show the test list page
    document.getElementById('test-list-title').textContent = streamName;
    showPage('test-list-page');

    // Load quizzes for the specific stream
    await loadQuizzes(streamName);
}

// Function to show all tests
async function showAllTests() {
    // Check access first
    const hasAccess = await checkUserAccess();
    if (!hasAccess) {
        return;
    }

    // Show the test list page
    document.getElementById('test-list-title').textContent = 'All Tests';
    showPage('test-list-page');

    // Load all quizzes without filter
    await loadQuizzes();
}

document.addEventListener('DOMContentLoaded', async function() {
    // Check if we're on the quiz page
    const isQuizPage = window.location.pathname.includes('quiz.html');

    // Check access and load content
    const hasAccess = await enforceGlobalAccess();
    if (hasAccess) {
        // Pre-populate profile elements with basic data immediately
        if (!isQuizPage && currentUser) {
            // Set immediate fallback values to avoid "Loading..." states
            updateProfileElementsDirectly({
                name: currentUser.name || 'User',
                email: currentUser.email || 'Loading...',
                statusText: accessStatus === 'premium' ? 'Premium Active' :
                    accessStatus === 'trial' ? 'Trial Active' :
                        accessStatus === 'expired' ? 'Access Expired' : 'Checking...',
                statusClass: accessStatus || 'loading',
                daysLeft: accessStatus === 'premium' ? 30 : accessStatus === 'trial' ? 3 : 0,
                testsData: {
                    totalTests: userAnalytics?.totalTests || 0,
                    accuracy: userAnalytics?.accuracy || 0
                },
                memberSince: userSession?.user?.created_at,
                totalStudyTime: userAnalytics?.totalTests ? userAnalytics.totalTests * 3 : 0
            });

            // Then load actual profile data in background
            console.log('Loading profile data on startup...');
            loadUserProfile().then(() => {
                updateWelcomeMessage();
            });
        }

        // Load homepage-specific content
        if (!isQuizPage) {
            console.log('Loading analytics data for home page...');
            await loadUserAnalytics();
            console.log('Loading quizzes for homepage...');
            loadQuizzes();
            setupSearch();
        }

        // Set up profile image
        const profileImg = document.querySelector('.profile-picture');
        if (profileImg && !profileImg.src.includes('pic.png')) {
            profileImg.src = '/pic.png';
        }
    }
});