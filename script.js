
// Supabase configuration
const supabaseUrl = 'https://zhhsribtekwpwnnmyoee.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoaHNyaWJ0ZWt3cHdubm15b2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5OTI4MjIsImV4cCI6MjA2NjU2ODgyMn0.WbHLwBHbONle_m4hSKBt1JL5Yaal_7JBko6UnqUtT4I';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Global variables
let currentUser = null;
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

async function initializeUser() {
    let deviceId = localStorage.getItem('device_id');
    let userName = localStorage.getItem('user_name');
    
    if (!deviceId || !userName) {
        showNameModal();
        return;
    }
    
    currentUser = { device_id: deviceId, name: userName };
    
    // Check if user exists in database
    const { data: existingUser } = await supabase
        .from('user_trials')
        .select('*')
        .eq('device_id', deviceId)
        .single();
    
    if (!existingUser) {
        // Insert new user trial
        await supabase
            .from('user_trials')
            .insert({
                device_id: deviceId,
                name: userName,
                start_date: new Date().toISOString()
            });
    }
    
    // Check access status
    await checkGlobalAccess();
}

async function checkGlobalAccess() {
    if (!currentUser) {
        return false;
    }
    
    // Check trial status first
    const { data: trial } = await supabase
        .from('user_trials')
        .select('start_date')
        .eq('device_id', currentUser.device_id)
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
        .eq('device_id', currentUser.device_id)
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
    modal.innerHTML = `
        <div class="modal-content premium-content">
            <div class="premium-header">
                <h2>🚀 Trial Expired</h2>
                <p>Your 3-day free trial has ended. Upgrade to Premium to continue accessing all quizzes!</p>
            </div>
            <div class="premium-features">
                <h3>Premium Benefits:</h3>
                <ul>
                    <li>✅ Unlimited access to all quizzes</li>
                    <li>✅ 90 days of full access</li>
                    <li>✅ No restrictions on attempts</li>
                    <li>✅ Priority support</li>
                </ul>
            </div>
            <div class="premium-pricing">
                <div class="price">₹99 for 90 days</div>
                <button class="btn btn-premium" onclick="initiatePremiumPayment()">Buy Premium Now</button>
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
    
    const options = {
        key: 'rzp_test_o1mGGxGdk4rBCk',
        amount: 9900, // ₹99 in paise
        currency: 'INR',
        name: 'Test Sagar Premium',
        description: 'Unlock all quizzes for 90 days',
        prefill: {
            name: currentUser.name,
            email: '', // Can be empty for test mode
            contact: '' // Can be empty for test mode
        },
        theme: {
            color: '#4A90E2'
        },
        handler: async function(response) {
            await handlePaymentSuccess(response);
        },
        modal: {
            ondismiss: function() {
                console.log('Payment cancelled');
            }
        }
    };
    
    const rzp = new Razorpay(options);
    rzp.open();
}

async function handlePaymentSuccess(paymentResponse) {
    try {
        // Calculate expiry date (90 days from now)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
        
        // Insert or update premium user
        const { error } = await supabase
            .from('premium_users')
            .upsert({
                device_id: currentUser.device_id,
                name: currentUser.name,
                expiry_date: expiryDate.toISOString()
            });
        
        if (error) {
            throw error;
        }
        
        // Close premium modal
        const premiumModal = document.getElementById('premiumModal');
        if (premiumModal) {
            premiumModal.remove();
        }
        
        // Update access status
        accessStatus = 'premium';
        
        // Show success message
        alert('🎉 Payment successful! You now have Premium access for 90 days.');
        
        // Reload the page to reflect new access
        window.location.reload();
        
    } catch (error) {
        console.error('Error updating premium status:', error);
        alert('Payment successful but there was an error updating your account. Please contact support.');
    }
}

function showNameModal() {
    const modal = document.getElementById('nameModal');
    if (modal) {
        modal.classList.add('show');
        
        const submitBtn = document.getElementById('submitName');
        const nameInput = document.getElementById('nameInput');
        
        submitBtn.onclick = async () => {
            const name = nameInput.value.trim();
            if (name) {
                const deviceId = generateUUID();
                localStorage.setItem('device_id', deviceId);
                localStorage.setItem('user_name', name);
                
                currentUser = { device_id: deviceId, name: name };
                
                // Insert into user_trials
                await supabase
                    .from('user_trials')
                    .insert({
                        device_id: deviceId,
                        name: name,
                        start_date: new Date().toISOString()
                    });
                
                modal.classList.remove('show');
            }
        };
        
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
    }
}

async function checkUserAccess() {
    if (!currentUser) {
        alert('Please refresh the page and enter your name.');
        return false;
    }
    
    if (accessStatus === 'trial' || accessStatus === 'premium') {
        return true;
    }
    
    if (accessStatus === 'expired') {
        showPremiumModal();
        return false;
    }
    
    // Fallback - recheck access
    return await checkGlobalAccess();
}

// Quiz loading functions
async function loadQuizzes() {
    try {
        const { data, error } = await supabase
            .from('tests')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        quizzes = data || [];
        displayQuizzes(quizzes);
        updateSidebar(quizzes);
    } catch (error) {
        console.error('Error loading quizzes:', error);
        document.getElementById('quizGrid').innerHTML = '<div class="error">Failed to load quizzes. Please try again.</div>';
    }
}

function displayQuizzes(quizzesToShow) {
    const quizGrid = document.getElementById('quizGrid');
    
    if (!quizzesToShow || quizzesToShow.length === 0) {
        quizGrid.innerHTML = '<div class="loading">No quizzes available.</div>';
        return;
    }
    
    quizGrid.innerHTML = quizzesToShow.map(quiz => `
        <div class="quiz-card" onclick="openQuiz('${quiz.id}')">
            <h3>${quiz.name}</h3>
            <p>${quiz.description || 'No description available'}</p>
            <div class="quiz-meta">
                <span>Created: ${new Date(quiz.created_at).toLocaleDateString()}</span>
                <span>Take Quiz →</span>
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
                <p style="font-size: 0.9rem; color: #666; margin-top: 4px;">${quiz.description || 'No description'}</p>
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

// Sidebar functionality
function setupSidebar() {
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const closeSidebar = document.getElementById('closeSidebar');
    
    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.add('open');
        });
    }
    
    if (closeSidebar && sidebar) {
        closeSidebar.addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }
    
    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !hamburger.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
}

// Quiz functions
async function openQuiz(testId) {
    // Check user access before opening quiz
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
        // Load quiz metadata
        const { data: quiz, error: quizError } = await supabase
            .from('tests')
            .select('*')
            .eq('id', testId)
            .single();
        
        if (quizError) throw quizError;
        currentQuiz = quiz;
        
        // Load questions
        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .eq('test_id', testId)
            .order('subject');
        
        if (questionsError) throw questionsError;
        questions = questionsData || [];
        
        // Initialize quiz interface
        initializeQuizInterface();
        
    } catch (error) {
        console.error('Error loading quiz:', error);
        alert('Failed to load quiz. Please try again.');
        window.location.href = 'index.html';
    }
}

function initializeQuizInterface() {
    // Set quiz title
    document.title = `${currentQuiz.name} - Test Sagar`;
    
    // Initialize timer
    quizStartTime = Date.now();
    startTimer();
    
    // Setup navigation
    setupQuizNavigation();
    
    // Display first question
    displayQuestion(0);
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
}

function setupQuizNavigation() {
    const questionNav = document.querySelector('.question-nav');
    if (!questionNav) return;
    
    // Group questions by subject
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
    
    // Expand first section by default
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
    
    // Update question navigation
    updateQuestionNavigation();
    
    // Update question content
    const questionContent = document.querySelector('.question-content');
    if (!questionContent) return;
    
    questionContent.innerHTML = `
        <div class="question-header">
            <div class="question-number">Question ${index + 1} of ${questions.length}</div>
            <div class="subject-badge">${question.subject}</div>
        </div>
        
        <div class="question-body">
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
    const options = question.options || ['A', 'B', 'C', 'D'];
    const currentAnswer = userAnswers[questionIndex];
    
    return `
        <div class="options">
            ${options.map(option => `
                <label class="option ${currentAnswer === option ? 'selected' : ''}" onclick="selectOption('${option}', ${questionIndex})">
                    <input type="radio" name="question_${questionIndex}" value="${option}" ${currentAnswer === option ? 'checked' : ''} style="display: none;">
                    ${option}
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
    
    // Update UI
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
    // Update question buttons
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
    
    // Close navigation on mobile
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
    
    // Update button text
    const markBtn = document.querySelector('.btn-warning');
    if (markBtn) {
        markBtn.textContent = markedQuestions.has(currentQuestionIndex) ? 'Unmark' : 'Mark for Review';
    }
}

function saveAndNext() {
    if (currentQuestionIndex < questions.length - 1) {
        displayQuestion(currentQuestionIndex + 1);
    } else {
        // Last question, show submit option
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
    
    // Calculate results
    const results = calculateResults();
    
    // Store results in localStorage for result page
    localStorage.setItem('quiz_results', JSON.stringify({
        quiz: currentQuiz,
        questions: questions,
        userAnswers: userAnswers,
        markedQuestions: Array.from(markedQuestions),
        results: results,
        completedAt: new Date().toISOString()
    }));
    
    // Redirect to results page
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

// Result page functions
function loadResults() {
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
    
    // Update page title
    document.title = `${quiz.name} - Results - Test Sagar`;
    
    // Display results
    document.querySelector('.result-container').innerHTML = `
        <div class="result-header">
            <h1>🎉 Quiz Completed!</h1>
            <h2>${quiz.name}</h2>
            <p>Completed on ${new Date(completedAt).toLocaleString()}</p>
        </div>
        
        <div class="score-summary">
            <div class="score-grid">
                <div class="score-item correct">
                    <h3>✅ Correct</h3>
                    <p>${results.correct}</p>
                </div>
                <div class="score-item incorrect">
                    <h3>❌ Incorrect</h3>
                    <p>${results.incorrect}</p>
                </div>
                <div class="score-item skipped">
                    <h3>❓ Skipped</h3>
                    <p>${results.skipped}</p>
                </div>
            </div>
            <div class="score-percentage">${results.percentage}%</div>
            <p style="text-align: center; color: #666;">Score: ${results.correct} / ${results.total}</p>
        </div>
        
        <div class="sectional-analysis">
            <h3>Subject-wise Analysis</h3>
            <table class="sectional-table">
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th>Correct</th>
                        <th>Incorrect</th>
                        <th>Skipped</th>
                        <th>Total</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(results.subjectStats).map(([subject, stats]) => `
                        <tr>
                            <td>${subject}</td>
                            <td>${stats.correct}</td>
                            <td>${stats.incorrect}</td>
                            <td>${stats.skipped}</td>
                            <td>${stats.total}</td>
                            <td>${stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="question-lists">
            <div class="question-list">
                <h3>✅ Correct Questions</h3>
                <ul>
                    ${results.correctQuestions.length > 0 ? 
                        results.correctQuestions.map(q => `<li>Question ${q}</li>`).join('') :
                        '<li>None</li>'
                    }
                </ul>
            </div>
            
            <div class="question-list">
                <h3>❌ Incorrect Questions</h3>
                <ul>
                    ${results.incorrectQuestions.length > 0 ? 
                        results.incorrectQuestions.map(q => `<li>Question ${q}</li>`).join('') :
                        '<li>None</li>'
                    }
                </ul>
            </div>
            
            <div class="question-list">
                <h3>❓ Unattempted Questions</h3>
                <ul>
                    ${results.skippedQuestions.length > 0 ? 
                        results.skippedQuestions.map(q => `<li>Question ${q}</li>`).join('') :
                        '<li>None</li>'
                    }
                </ul>
            </div>
        </div>
        
        <div class="result-actions">
            <button class="btn btn-primary" onclick="reviewAnswers()">Review Answers</button>
            <button class="btn btn-secondary" onclick="retakeQuiz()">Retake Quiz</button>
            <button class="btn btn-secondary" onclick="goHome()">Home</button>
        </div>
    `;
}

function reviewAnswers() {
    // Implementation for reviewing answers
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

// Cleanup function
function cleanup() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
}

// Event listeners
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);

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
