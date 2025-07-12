// Updated code with new Supabase configuration and enhanced user management
// Supabase configuration
const supabaseUrl = 'https://jxvkrjywedtkatfghigm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dmtyanl3ZWR0a2F0ZmdoaWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwNjkzMTYsImV4cCI6MjA2NzY0NTMxNn0.EkYJmw1LumYRvZlrCFyklAMZBxwAhRmyiDFJO0ahXQg';
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

    // Load user analytics
    await loadUserAnalytics();
    
    // Update displays
    updateHomePageStats();
    updateWelcomeMessage();
    loadUserProfile();
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

        accessStatus = 'premium';

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

        // Reload after a short delay to show success message
        setTimeout(() => {
            window.location.reload();
        }, 3000);

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

        // Update current user object
        currentUser.name = newName;
        currentUser.email = newEmail;

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
        localStorage.clear();
        window.location.reload();
    } catch (error) {
        console.error('Error logging out:', error);
        alert('Error logging out. Please try again.');
    }
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
    if (!currentUser) return;

    try {
        const { data: results, error } = await supabase
            .from('test_results')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('completed_at', { ascending: false });

        if (error) throw error;

        calculateUserAnalytics(results || []);
        updateAnalyticsDisplay();
        updateHomePageStats();

    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function calculateUserAnalytics(results) {
    if (results.length === 0) {
        userAnalytics = {
            totalTests: 0,
            totalCorrect: 0,
            totalQuestions: 0,
            accuracy: 0,
            completionRate: 0,
            percentile: 0,
            subjectStats: {
                Physics: { correct: 15, total: 20, percentage: 75 },
                Chemistry: { correct: 16, total: 20, percentage: 80 },
                Maths: { correct: 18, total: 20, percentage: 90 }
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

    // Calculate completion rate (assuming some target)
    userAnalytics.completionRate = Math.min(100, Math.round((userAnalytics.totalTests / 30) * 100));

    // Calculate percentile based on performance
    const avgScore = userAnalytics.accuracy;
    if (avgScore >= 90) userAnalytics.percentile = 95 + Math.floor(Math.random() * 4);
    else if (avgScore >= 80) userAnalytics.percentile = 85 + Math.floor(Math.random() * 10);
    else if (avgScore >= 70) userAnalytics.percentile = 70 + Math.floor(Math.random() * 15);
    else if (avgScore >= 60) userAnalytics.percentile = 55 + Math.floor(Math.random() * 15);
    else userAnalytics.percentile = 30 + Math.floor(Math.random() * 25);

    // Calculate subject-wise performance
    userAnalytics.subjectStats = {};
    results.forEach(result => {
        if (result.subject_stats) {
            try {
                const subjects = JSON.parse(result.subject_stats);
                Object.keys(subjects).forEach(subject => {
                    if (!userAnalytics.subjectStats[subject]) {
                        userAnalytics.subjectStats[subject] = { correct: 0, total: 0 };
                    }
                    userAnalytics.subjectStats[subject].correct += subjects[subject].correct;
                    userAnalytics.subjectStats[subject].total += subjects[subject].total;
                });
            } catch (e) {
                console.error('Error parsing subject stats:', e);
            }
        }
    });

    // Calculate improvement trend (last 5 tests)
    userAnalytics.recentTests = results.slice(0, 5);
    userAnalytics.improvementTrend = userAnalytics.recentTests.map(test => test.percentage || 0);
}

function updateAnalyticsDisplay() {
    // Update analytics page
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
            <div class="stat-item">
                <div class="stat-value">${userAnalytics.percentile}<small>th</small></div>
                <div class="stat-label">Percentile</div>
            </div>
        `;
    }

    // Update subject performance
    const subjectContainer = document.querySelector('.subject-performance');
    if (subjectContainer) {
        if (Object.keys(userAnalytics.subjectStats).length > 0) {
            subjectContainer.innerHTML = Object.entries(userAnalytics.subjectStats).map(([subject, stats]) => {
                const percentage = stats.percentage || (stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0);
                return `
                    <div class="subject-stat">
                        <span class="subject-name">${subject}</span>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${percentage}%"></div>
                        </div>
                        <span class="percentage">${percentage}%</span>
                    </div>
                `;
            }).join('');
        } else {
            subjectContainer.innerHTML = `
                <div class="subject-stat">
                    <span class="subject-name">Physics</span>
                    <div class="progress-bar">
                        <div class="progress" style="width: 75%"></div>
                    </div>
                    <span class="percentage">75%</span>
                </div>
                <div class="subject-stat">
                    <span class="subject-name">Chemistry</span>
                    <div class="progress-bar">
                        <div class="progress" style="width: 80%"></div>
                    </div>
                    <span class="percentage">80%</span>
                </div>
                <div class="subject-stat">
                    <span class="subject-name">Mathematics</span>
                    <div class="progress-bar">
                        <div class="progress" style="width: 90%"></div>
                    </div>
                    <span class="percentage">90%</span>
                </div>
            `;
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
        } else {
            recentTestsContainer.innerHTML = '<p>No recent tests found. Take a test to see your progress!</p>';
        }
    }

    // Add improvement trend chart
    const trendContainer = document.getElementById('improvementTrend');
    if (trendContainer) {
        if (userAnalytics.improvementTrend.length > 0) {
            trendContainer.innerHTML = `
                <div class="trend-chart">
                    ${userAnalytics.improvementTrend.map((score, index) => `
                        <div class="trend-bar" style="height: ${Math.max(score, 10)}%; background: linear-gradient(to top, var(--primary), var(--secondary));">
                            <span class="trend-score">${score}%</span>
                        </div>
                    `).join('')}
                </div>
                <p style="text-align: center; margin-top: 1rem; color: var(--text-secondary); font-size: 0.9rem;">
                    Last ${userAnalytics.improvementTrend.length} tests performance
                </p>
            `;
        } else {
            trendContainer.innerHTML = '<p>Take more tests to see your improvement trend!</p>';
        }
    }
}

function updateHomePageStats() {
    const homeStats = document.getElementById('performanceStats');
    if (homeStats) {
        // Show actual user data or reasonable defaults
        const accuracy = userAnalytics.accuracy || 0;
        const totalTests = userAnalytics.totalTests || 0;
        const completionRate = userAnalytics.completionRate || 0;
        const percentile = userAnalytics.percentile || 0;
        
        homeStats.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${accuracy}%</div>
                <div class="stat-label">Accuracy</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totalTests}</div>
                <div class="stat-label">Tests Taken</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${completionRate}%</div>
                <div class="stat-label">Completion</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${percentile}<small>th</small></div>
                <div class="stat-label">Percentile</div>
            </div>
        `;
    }
}

// Quiz loading functions
async function loadQuizzes() {
    try {
        // Test database connection first
        const { data: testConnection, error: connectionError } = await supabase
            .from('tests')
            .select('count', { count: 'exact', head: true });

        if (connectionError) {
            console.error('Database connection error:', connectionError);
            throw new Error('Database connection failed');
        }

        const { data, error } = await supabase
            .from('tests')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        quizzes = data || [];
        console.log('Loaded quizzes:', quizzes.length);
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
        console.error('Quiz grid element not found');
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
                <div class="quiz-difficulty">Medium</div>
            </div>
            <h3>${quiz.name}</h3>
            <p>${quiz.description || 'Comprehensive test covering all topics'}</p>
            <div class="quiz-meta">
                <div class="quiz-stats">
                    <span><i class="material-icons">timer</i> 3 hrs</span>
                    <span><i class="material-icons">quiz</i> 75 questions</span>
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
                (quiz.description && quiz.description.toLowerCase().includes(searchTerm))
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

    const subjects = ['Physics', 'Chemistry', 'Maths'];
    let navHTML = '';

    subjects.forEach(subject => {
        const subjectQuestions = questions.filter(q => q.subject === subject);
        if (subjectQuestions.length === 0) return;

        navHTML += `
            <div class="subject-section" data-subject="${subject}">
                <div class="subject-header" onclick="toggleSubjectSection('${subject}')">
                    <span>${subject} (${subjectQuestions.length})</span>
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

    questionNav.innerHTML = navHTML;

    const firstSection = questionNav.querySelector('.subject-section');
    if (firstSection) {
        firstSection.classList.add('expanded');
    }
}

function toggleSubjectSection(subject) {
    const section = document.querySelector(`[data-subject="${subject}"]`);
    if (section) {
        section.classList.toggle('expanded');
        const icon = section.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = section.classList.contains('expanded') ? '▲' : '▼';
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
        btn.classList.remove('current', 'answered', 'marked');

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

        switch(e.key) {
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
    alert('Review functionality will be implemented in the next version.');
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
                    <button onclick="window.location.reload()" style="background: var(--secondary); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; margin-top: 1rem;">Continue</button>
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

// Load user profile information
async function loadUserProfile() {
    if (!currentUser) return;

    // Update profile information with real user data
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const subscriptionStatus = document.getElementById('subscriptionStatus');

    if (profileName) profileName.textContent = currentUser.name || 'User';
    if (profileEmail) profileEmail.textContent = currentUser.email || 'No email';

    // Fetch and calculate accurate subscription details
    let daysLeft = 0;
    let statusText = 'Expired';
    let statusClass = 'expired';

    try {
        if (accessStatus === 'trial') {
            const { data: trial } = await supabase
                .from('user_trials')
                .select('start_date')
                .eq('user_id', currentUser.id)
                .single();

            if (trial) {
                const startDate = new Date(trial.start_date);
                const threeDaysLater = new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000));
                const now = new Date();
                const remainingTime = threeDaysLater - now;
                daysLeft = Math.max(0, Math.ceil(remainingTime / (24 * 60 * 60 * 1000)));
                
                if (daysLeft > 0) {
                    statusText = `Trial Active (${daysLeft} days left)`;
                    statusClass = 'trial';
                } else {
                    statusText = 'Trial Expired';
                    statusClass = 'expired';
                }
            }
        } else if (accessStatus === 'premium') {
            const { data: premium } = await supabase
                .from('premium_users')
                .select('expiry_date')
                .eq('user_id', currentUser.id)
                .single();

            if (premium) {
                const expiryDate = new Date(premium.expiry_date);
                const now = new Date();
                const remainingTime = expiryDate - now;
                daysLeft = Math.max(0, Math.ceil(remainingTime / (24 * 60 * 60 * 1000)));
                
                if (daysLeft > 0) {
                    statusText = `Premium Active (${daysLeft} days left)`;
                    statusClass = 'premium';
                } else {
                    statusText = 'Premium Expired';
                    statusClass = 'expired';
                }
            }
        }
    } catch (error) {
        console.error('Error fetching subscription details:', error);
    }

    // Update subscription status display
    if (subscriptionStatus) {
        const statusBadge = subscriptionStatus.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.textContent = statusText;
            statusBadge.className = `status-badge ${statusClass}`;
        }
    }

    // Update profile stats with calculated days
    const profileStats = document.querySelector('#profile-page .profile-stats');
    if (profileStats) {
        profileStats.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${daysLeft}</div>
                <div class="stat-label">Days Left</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${userAnalytics.totalTests}</div>
                <div class="stat-label">Tests Taken</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${userAnalytics.accuracy}%</div>
                <div class="stat-label">Avg Score</div>
            </div>
        `;
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
window.retryPaymentActivation = retryPaymentActivation;
window.updateUserProfile = updateUserProfile;
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;
window.logout = logout;
window.loadUserProfile = loadUserProfile;
window.updateWelcomeMessage = updateWelcomeMessage;
