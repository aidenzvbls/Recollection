document.addEventListener('DOMContentLoaded', function() {
    // Initialize state
    let decks = JSON.parse(localStorage.getItem('flashcards-decks')) || {};
    let currentStudyingDeck = null;
    let cardsToStudy = [];
    let currentCardIndex = 0;
    let editingCardId = null;
    let resettingDeckName = null;
    let editingDeckName = null;
    let currentTags = [];
    let cardType = 'basic'; // 'basic' or 'cloze'
    let isEditingDeck = false;
    let againCards = []; // Cards that were rated "again" to replay at end
    let completedCardsHistory = []; // Track completed cards for going back functionality
    let studySession = JSON.parse(localStorage.getItem('current-study-session')) || null;
    let statistics = JSON.parse(localStorage.getItem('flashcards-stats')) || {
        totalStudied: 0,
        streak: 0,
        lastStudyDate: null,
        dailyStats: {},
        cardsMastered: 0
    };

    // Fix for button interaction issues by using event delegation
    document.addEventListener('click', function(e) {
        // Find the closest button
        const button = e.target.closest('button');
        if (!button) return;

        // Check for specific buttons and trigger their handlers
        if (button.classList.contains('study-deck-btn')) {
            const deckName = button.closest('.deck-card').querySelector('.deck-title').textContent;
            startStudySession(deckName);
        } else if (button.classList.contains('study-hard-btn')) {
            const deckName = button.getAttribute('data-deck');
            startStudySession(deckName, 'hard');
        } else if (button.classList.contains('edit-deck-btn')) {
            const deckName = button.getAttribute('data-deck');
            editDeck(deckName);
        } else if (button.classList.contains('export-deck-btn')) {
            const deckName = button.getAttribute('data-deck');
            exportDeck(deckName);
        } else if (button.classList.contains('card-action-btn') && button.classList.contains('edit')) {
            const cardId = button.dataset.cardId;
            editCardInSidebar(cardId);
        } else if (button.classList.contains('card-action-btn') && button.classList.contains('delete')) {
            const cardId = button.dataset.cardId;
            deleteCardFromSidebar(cardId);
        } else if (button.id === 'restart-current-session') {
            if (currentStudyingDeck) {
                // Reset all cards in current deck and restart session
                if (decks[currentStudyingDeck]) {
                    decks[currentStudyingDeck].forEach(card => {
                        card.lastReviewed = null;
                        card.interval = 1;
                        card.ease = 2.5;
                        card.status = 'new';
                        card.lastPerformance = null;
                    });
                    saveDecks();
                    startStudySession(currentStudyingDeck);
                    showToast('Success', 'Session restarted', 'success');
                }
            }
        } else if (button.classList.contains('reset-deck-btn')) {
            const deckName = button.closest('.deck-card').querySelector('.deck-title').textContent;
            resetDeck(deckName);
        } else if (button.classList.contains('delete-deck-btn')) {
            const deckName = button.closest('.deck-card').querySelector('.deck-title').textContent;
            const cardCount = decks[deckName] ? decks[deckName].length : 0;
            if (confirm(`Are you sure you want to delete "${deckName}" with ${cardCount} cards?\n\nThis action cannot be undone.`)) {
                delete decks[deckName];
                saveDecks();
                renderDeckList();
                showToast('Success', `Deck "${deckName}" deleted`, 'info');
            }
        }
    });



    // Set default card type to basic since we removed the toggle
    cardType = 'basic';

    // Tags input functionality
    const tagInput = document.getElementById('tag-input');
    const tagsDisplay = document.getElementById('tags-display');

    tagInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && this.value.trim() !== '') {
            e.preventDefault();
            addTag(this.value.trim());
            this.value = '';
        }
    });

    function addTag(tagText) {
        // Don't add duplicate tags
        if (currentTags.includes(tagText)) return;

        currentTags.push(tagText);
        renderTags();
    }

    function removeTag(tagText) {
        currentTags = currentTags.filter(tag => tag !== tagText);
        renderTags();
    }

    function clearTags() {
        currentTags = [];
        renderTags();
    }

    function renderTags() {
        if (currentTags.length === 0) {
            tagsDisplay.innerHTML = '';
            return;
        }

        const tagsHtml = currentTags.map(tag => 
            `<span class="tag-item" data-tag="${tag}">${tag}</span>`
        ).join(', ');

        tagsDisplay.innerHTML = `<div class="tags-text">${tagsHtml}</div>`;

        // Add click listeners to all tag items
        tagsDisplay.querySelectorAll('.tag-item').forEach(tagElement => {
            tagElement.addEventListener('click', function() {
                const tagToRemove = this.getAttribute('data-tag');
                removeTag(tagToRemove);
            });
        });
    }

    // Add card functionality
    const addCardButton = document.getElementById('add-card');
    const cardFrontInput = document.getElementById('card-front');
    const cardBackInput = document.getElementById('card-back');
    const deckNameInput = document.getElementById('deck-name');

    addCardButton.addEventListener('click', () => {
        let front = cardFrontInput.value.trim();
        let back = cardBackInput.value.trim();
        const deckName = deckNameInput.value.trim() || 'Default Deck';

        if (!front) {
            showToast('Error', 'Front side cannot be empty', 'error');
            return;
        }

        if (!deckName) {
            showToast('Error', 'Deck name cannot be empty', 'error');
            return;
        }

        // If editing mode and deck name changed, check if new name exists
        if (isEditingDeck && editingDeckName !== deckName && decks[deckName]) {
            showToast('Error', 'A deck with that name already exists', 'error');
            return;
        }

        // Handle deck renaming in edit mode
        if (isEditingDeck && editingDeckName !== deckName) {
            if (decks[editingDeckName]) {
                decks[deckName] = decks[editingDeckName];
                delete decks[editingDeckName];
            }
            editingDeckName = deckName;
        }

        // Create deck if it doesn't exist
        if (!decks[deckName]) {
            decks[deckName] = [];
        }

        // Update all existing cards with new tags if in edit mode
        if (isEditingDeck) {
            decks[deckName].forEach(card => {
                card.tags = [...currentTags];
            });
        }

        // Check if we're updating an existing card
        const addButton = document.getElementById('add-card');
        if (addButton.dataset.mode === 'update' && editingCardId) {
            // Update existing card
            const cardIndex = decks[deckName].findIndex(c => c.id === editingCardId);
            if (cardIndex !== -1) {
                decks[deckName][cardIndex].front = front;
                decks[deckName][cardIndex].back = back;
                decks[deckName][cardIndex].tags = [...currentTags];
                
                // Reset button to add mode
                addButton.innerHTML = '<i class="fas fa-plus"></i> Add Card';
                addButton.dataset.mode = 'add';
                editingCardId = null;
                
                showToast('Success', 'Card updated successfully', 'success');
            }
        } else {
            // Add new card to deck
            const newCard = {
                id: generateId(),
                front: front,
                back: back,
                tags: [...currentTags],
                type: cardType,
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new'
            };

            decks[deckName].push(newCard);
            showToast('Success', `Card added to "${deckName}"`, 'success');
        }

        // Save to localStorage
        saveDecks();

        // Clear inputs but keep deck name and tags
        cardFrontInput.value = '';
        cardBackInput.value = '';
        cardFrontInput.focus();

        // Update existing cards list
        renderExistingCards(deckName);

        // Update deck list
        renderDeckList();
    });

    // Clear form
    document.getElementById('clear-form').addEventListener('click', () => {
        deckNameInput.value = '';
        cardFrontInput.value = '';
        cardBackInput.value = '';
        clearTags();
        cardFrontInput.focus();
    });



    // Edit card modal
    const editCardModal = document.getElementById('edit-card-modal');
    const closeEditModal = document.getElementById('close-edit-modal');
    const saveEditButton = document.getElementById('save-edit');
    const cancelEditButton = document.getElementById('cancel-edit');

    closeEditModal.addEventListener('click', () => {
        editCardModal.classList.remove('active');
    });

    cancelEditButton.addEventListener('click', () => {
        editCardModal.classList.remove('active');
    });

    // Edit current card button (Assuming there's a button with this ID somewhere, maybe in the study tab)
    // If not, this event listener won't do anything unless the button is added to the HTML.
    const editCurrentCardButton = document.getElementById('edit-current-card');
    if (editCurrentCardButton) {
        editCurrentCardButton.addEventListener('click', () => {
            if (currentCardIndex < cardsToStudy.length) {
                const card = cardsToStudy[currentCardIndex];
                editingCardId = card.id;
                document.getElementById('edit-card-front').value = card.front;
                document.getElementById('edit-card-back').value = card.back;
                document.getElementById('edit-card-modal').classList.add('active');
            }
        });
    }

    saveEditButton.addEventListener('click', () => {
        if (editingCardId) {
            const newFront = document.getElementById('edit-card-front').value.trim();
            const newBack = document.getElementById('edit-card-back').value.trim();

            if (!newFront) {
                showToast('Error', 'Front side cannot be empty', 'error');
                return;
            }

            // Find and update the card
            for (const deckName in decks) {
                for (let i = 0; i < decks[deckName].length; i++) {
                    if (decks[deckName][i].id === editingCardId) {
                        decks[deckName][i].front = newFront;
                        decks[deckName][i].back = newBack;
                        saveDecks();

                        showToast('Success', 'Card updated successfully', 'success');
                        editCardModal.classList.remove('active');

                        // If studying, update current card display if needed
                        if (currentStudyingDeck && currentCardIndex < cardsToStudy.length) {
                            const currentCard = cardsToStudy[currentCardIndex];
                            if (currentCard.id === editingCardId) {
                                // Update the card in cardsToStudy array
                                currentCard.front = newFront;
                                currentCard.back = newBack;
                                updateCardDisplay(currentCard);
                            }
                        }

                        return;
                    }
                }
            }
        }
    });



    // Reset deck functionality
    const resetDeckModal = document.getElementById('reset-deck-modal');
    const closeResetModal = document.getElementById('close-reset-modal');
    const confirmResetButton = document.getElementById('confirm-reset');
    const cancelResetButton = document.getElementById('cancel-reset');

    closeResetModal.addEventListener('click', () => {
        resetDeckModal.classList.remove('active');
    });

    cancelResetButton.addEventListener('click', () => {
        resetDeckModal.classList.remove('active');
    });

    confirmResetButton.addEventListener('click', () => {
        if (resettingDeckName && decks[resettingDeckName]) {
            // Reset all cards in the deck
            decks[resettingDeckName].forEach(card => {
                card.lastReviewed = null;
                card.interval = 1;
                card.ease = 2.5;
                card.status = 'new';
            });

            saveDecks();
            resetDeckModal.classList.remove('active');
            renderDeckList();

            showToast('Success', `Deck "${resettingDeckName}" has been reset`, 'success');
        }
    });

    function resetDeck(deckName) {
        resettingDeckName = deckName;
        resetDeckModal.classList.add('active');
    }

    // Add economics example deck if it doesn't exist
    if (!decks['Economics 101']) {
        decks['Economics 101'] = [
            {
                id: generateId(),
                front: "What is opportunity cost?",
                back: "The value of the next best alternative that must be given up in order to pursue a certain action. It represents the benefits you could have received by taking an alternative action.",
                tags: ["microeconomics", "fundamental"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'basic'
            },
            {
                id: generateId(),
                front: "Define GDP and explain its components.",
                back: "Gross Domestic Product (GDP) is the total monetary value of all final goods and services produced within a country's borders in a specific time period.\n\nComponents:\n- Consumption (C): Household spending\n- Investment (I): Business spending on capital\n- Government Spending (G): Public expenditure\n- Net Exports (NX): Exports minus imports",
                tags: ["macroeconomics", "measurement"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'basic'
            },
            {
                id: generateId(),
                front: "What are the four factors of production?",
                back: "1. Land: Natural resources\n2. Labor: Human effort and work\n3. Capital: Human-made tools and infrastructure\n4. Entrepreneurship: Organization, risk-taking, and innovation",
                tags: ["microeconomics", "fundamental"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'basic'
            },
            {
                id: generateId(),
                front: "Define elastic and inelastic demand with examples.",
                back: "Elastic demand: When a small change in price leads to a large change in quantity demanded. Price elasticity > 1. Examples: luxury goods, products with many substitutes.\n\nInelastic demand: When a change in price has little effect on quantity demanded. Price elasticity < 1. Examples: necessities, goods with few substitutes (insulin, gasoline).",
                tags: ["microeconomics", "elasticity"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'basic'
            },
            {
                id: generateId(),
                front: "What is the difference between fiscal and monetary policy?",
                back: "Fiscal Policy: Government's use of taxation and spending to influence the economy. Implemented by legislative and executive branches.\n\nMonetary Policy: Control of money supply and interest rates to influence the economy. Implemented by central banks (e.g., Federal Reserve).",
                tags: ["macroeconomics", "policy"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'basic'
            },
            {
                id: generateId(),
                front: "What is the Law of {{Diminishing Marginal Returns}}?",
                back: "As more units of a variable input are added to fixed inputs, the marginal product of the variable input will eventually decrease. In other words, each additional unit of input yields less additional output than the previous unit.",
                tags: ["microeconomics", "production"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'cloze'
            },
            {
                id: generateId(),
                front: "The difference between {{perfect competition}} and {{monopoly}} includes the number of sellers and pricing power.",
                back: "Perfect Competition:\n- Many small firms\n- Identical products\n- Price takers\n- Free entry/exit\n- Perfect information\n\nMonopoly:\n- Single seller\n- Unique product with no close substitutes\n- Price maker\n- High barriers to entry\n- Profit maximizer (MR = MC)",
                tags: ["microeconomics", "market structure"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'cloze'
            },
            {
                id: generateId(),
                front: "The four main causes of inflation are {{demand-pull}}, {{cost-push}}, {{built-in}}, and {{monetary}} inflation.",
                back: "Main causes of inflation:\n\n1. Demand-Pull: Aggregate demand exceeds aggregate supply\n2. Cost-Push: Rising production costs push prices higher\n3. Built-In: Expectations of future inflation lead to higher wages and prices\n4. Monetary Inflation: Excessive growth in money supply relative to economic output",
                tags: ["macroeconomics", "inflation"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'cloze'
            },
            {
                id: generateId(),
                front: "What is the Laffer Curve?",
                back: "The Laffer Curve illustrates the relationship between tax rates and tax revenue collected by governments. It suggests that there is an optimal tax rate that maximizes revenue, beyond which higher rates actually reduce revenue due to decreased economic activity or increased tax avoidance.",
                tags: ["macroeconomics", "taxation"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'basic'
            },
            {
                id: generateId(),
                front: "Define {{comparative advantage}} and {{absolute advantage}}.",
                back: "Absolute Advantage: When a country or individual can produce more of a good with the same resources than another.\n\nComparative Advantage: When a country or individual can produce a good at a lower opportunity cost than another, even if they don't have an absolute advantage.",
                tags: ["international", "trade"],
                lastReviewed: null,
                interval: 1,
                ease: 2.5,
                status: 'new',
                type: 'cloze'
            }
        ];
        saveDecks();
    }

    // Render deck list
    function renderDeckList() {
        const deckList = document.getElementById('deck-list');
        const noDecks = document.getElementById('no-decks');
        deckList.innerHTML = '';

        const deckNames = Object.keys(decks);

        if (deckNames.length === 0) {
            deckList.style.display = 'none';
            noDecks.style.display = 'block';
        } else {
            deckList.style.display = 'grid';
            noDecks.style.display = 'none';

            // Color array for deck color tags
            const colors = [
                '#007AFF', // Blue
                '#34C759', // Green
                '#FF9500', // Orange
                '#FF2D55', // Red
                '#AF52DE', // Purple
                '#5AC8FA', // Light Blue
                '#FF3B30', // Red
                '#FFCC00'  // Yellow
            ];

            deckNames.forEach((deckName, index) => {
                const deckCards = decks[deckName];
                const dueCount = getDueCardsCount(deckName);
                const performanceCounts = getPerformanceCounts(deckName);

                // Get all unique tags in the deck
                const deckTags = new Set();
                deckCards.forEach(card => {
                    if (card.tags) {
                        card.tags.forEach(tag => deckTags.add(tag));
                    }
                });

                // Get color based on index
                const colorIndex = index % colors.length;
                const deckColor = colors[colorIndex];

                const deckElement = document.createElement('div');
                deckElement.className = 'deck-card';
                deckElement.innerHTML = `
                    <div class="deck-header">
                        <h3 class="deck-title">${deckName}</h3>
                        <div>${getLastStudiedDate(deckName)}</div>
                    </div>
                    <div class="deck-stats">
                        <div class="stat">
                            <i class="fas fa-clone"></i>
                            <span>${deckCards.length} cards</span>
                        </div>
                        <div class="stat">
                            <i class="fas fa-hourglass-half"></i>
                            <span>${dueCount} due</span>
                        </div>
                    </div>
                    <div class="tag-list">
                        ${Array.from(deckTags).slice(0, 3).map(tag => `<div class="tag">${tag}</div>`).join('')}
                        ${deckTags.size > 3 ? `<div class="tag">+${deckTags.size - 3}</div>` : ''}
                    </div>
                    <div class="deck-actions">
                        <div class="study-options">
                            <button class="study-deck-btn">
                                <i class="fas fa-book-open"></i> Study
                            </button>
                            ${performanceCounts.hard > 0 ? `<button class="study-hard-btn hard-btn-wide" title="Study Hard Cards (${performanceCounts.hard})" data-deck="${deckName}">
                                <i class="fas fa-exclamation"></i>
                            </button>` : ''}
                        </div>
                        <div class="deck-controls">
                            <button class="action-btn edit-deck-btn" title="Edit Deck" data-deck="${deckName}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn export-deck-btn" title="Export Deck" data-deck="${deckName}">
                                <i class="fas fa-file-export"></i>
                            </button>
                            <button class="action-btn reset-deck-btn" title="Reset Progress">
                                <i class="fas fa-redo-alt"></i>
                            </button>
                            <button class="action-btn delete-deck-btn" title="Delete Deck">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                `;

                deckList.appendChild(deckElement);
            });
        }
    }

    document.getElementById('create-first-deck').addEventListener('click', () => {
        openCreateDeckModal(false);
    });

    document.getElementById('create-new-deck').addEventListener('click', () => {
        openCreateDeckModal(false);
    });

    document.getElementById('show-deck-list').addEventListener('click', () => {
        document.getElementById('study-overlay').classList.remove('active');
        document.body.classList.remove('study-mode');
        
        // Refresh deck list to show updated hard button status
        renderDeckList();
        updateStatistics();
    });

    document.getElementById('back-to-decks').addEventListener('click', () => {
        document.getElementById('study-overlay').classList.remove('active');
        document.body.classList.remove('study-mode');
        
        // Refresh deck list to show updated hard button status
        renderDeckList();
        updateStatistics();
    });

    // Add resume session button to event delegation
    document.addEventListener('click', (e) => {
        if (e.target.id === 'resume-session' || e.target.closest('#resume-session')) {
            if (resumeStudySession()) {
                showToast('Success', 'Study session resumed', 'success');
            } else {
                showToast('Error', 'No session to resume', 'error');
            }
        }
    });





    // Study session
    function startStudySession(deckName, performanceFilter = null) {
        if (!decks[deckName] || decks[deckName].length === 0) {
            showToast('Error', `No cards in deck "${deckName}"`, 'error');
            return;
        }

        currentStudyingDeck = deckName;
        const deckTitle = performanceFilter ? 
            `${deckName} - ${performanceFilter.charAt(0).toUpperCase() + performanceFilter.slice(1)} Cards` : 
            deckName;
        document.getElementById('study-deck-name').textContent = deckTitle;

        // Get cards based on filter
        if (performanceFilter) {
            if (performanceFilter === 'hard') {
                // Include both 'hard' and 'again' cards in the hard filter
                cardsToStudy = decks[deckName].filter(card => 
                    card.lastPerformance === 'hard' || card.lastPerformance === 'again'
                );
            } else {
                cardsToStudy = decks[deckName].filter(card => card.lastPerformance === performanceFilter);
            }
        } else {
            // Get due cards using the SM-2 algorithm
            cardsToStudy = getDueCards(deckName);
        }

        // Reset again cards and completed history for new session
        againCards = [];
        completedCardsHistory = [];

        // Clear any existing session and save new one
        clearStudySession();
        saveStudySession();

        // Show study overlay and hide main content
        document.getElementById('study-overlay').classList.add('active');
        document.body.classList.add('study-mode');
        
        // Update study UI
        document.getElementById('total-count').textContent = cardsToStudy.length;
        document.getElementById('remaining-count').textContent = cardsToStudy.length;

        if (cardsToStudy.length > 0) {
            document.getElementById('study-card-container').style.display = 'block';
            document.getElementById('deck-selection').style.display = 'none';
            document.getElementById('session-complete').style.display = 'none';

            // Keep cards in original order (creation order)
            currentCardIndex = 0;

            // Show the first card
            showCurrentCard();

            // Update statistics
            updateStudyStreak();
        } else {
            document.getElementById('study-card-container').style.display = 'none';
            document.getElementById('deck-selection').style.display = 'none';
            document.getElementById('session-complete').style.display = 'block';
            document.getElementById('session-summary').textContent = `All cards in "${deckName}" are up to date.`;
        }
    }



    function getDueCards(deckName) {
        const now = new Date();

        return decks[deckName].filter(card => {
            // If never reviewed, it's due
            if (!card.lastReviewed) return true;

            // Otherwise check if it's due based on interval
            const lastReviewed = new Date(card.lastReviewed);
            const dueDate = new Date(lastReviewed);
            dueDate.setDate(dueDate.getDate() + card.interval);

            return now >= dueDate;
        });
    }

    function getDueCardsCount(deckName) {
        if (!decks[deckName]) return 0;

        const now = new Date();
        return decks[deckName].filter(card => {
            if (!card.lastReviewed) return true;

            const lastReviewed = new Date(card.lastReviewed);
            const dueDate = new Date(lastReviewed);
            dueDate.setDate(dueDate.getDate() + card.interval);

            return now >= dueDate;
        }).length;
    }

    function getLastStudiedDate(deckName) {
        if (!decks[deckName]) return 'Never studied';

        const lastReviewedDates = decks[deckName]
            .filter(card => card.lastReviewed)
            .map(card => new Date(card.lastReviewed));

        if (lastReviewedDates.length === 0) return 'Never studied';

        const mostRecent = new Date(Math.max(...lastReviewedDates));
        const now = new Date();
        const diffDays = Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Studied today';
        if (diffDays === 1) return 'Studied yesterday';
        return `Studied ${diffDays} days ago`;
    }

    function getPerformanceCounts(deckName) {
        if (!decks[deckName]) return { hard: 0 };
        
        let hardCount = 0;
        
        decks[deckName].forEach(card => {
            if (card.lastPerformance === 'again' || card.lastPerformance === 'hard') {
                hardCount++;
            }
        });
        
        return { hard: hardCount };
    }

    function showCurrentCard() {
        if (cardsToStudy.length === 0 || currentCardIndex >= cardsToStudy.length) {
            // If we have "again" cards to replay, add them to the end
            if (againCards.length > 0) {
                cardsToStudy = [...cardsToStudy, ...againCards];
                againCards = []; // Clear the again cards
                // Don't increment total count, just continue
            } else {
                completeStudySession();
                return;
            }
        }

        const card = cardsToStudy[currentCardIndex];

        // Reset card flip
        document.getElementById('flashcard').classList.remove('flipped');

        // Update card display
        updateCardDisplay(card);

        // Update card number
        document.getElementById('card-number').textContent = `Card ${currentCardIndex + 1}/${cardsToStudy.length}`;

        // Show flip controls, hide rating controls
        document.getElementById('flip-controls').style.display = 'flex';
        document.getElementById('rating-controls').style.display = 'none';

        // Update remaining count and progress bar
        const totalCards = cardsToStudy.length + againCards.length;
        document.getElementById('remaining-count').textContent = totalCards - currentCardIndex;
        const progressPercentage = ((currentCardIndex) / totalCards) * 100;
        document.getElementById('study-progress').style.width = `${progressPercentage}%`;
    }

    function updateCardDisplay(card) {
        // Update card content
        const frontContent = document.getElementById('card-front-content');
        const backContent = document.getElementById('card-back-content');

        // Handle cloze cards differently
        if (card.type === 'cloze') {
            // For front side, replace cloze with [...] and preserve line breaks
            frontContent.innerHTML = card.front.replace(/\n/g, '<br>').replace(/\{\{([^}]+)\}\}/g, '<span class="cloze">[...]</span>');

            // For back side, highlight the cloze content and preserve line breaks
            backContent.innerHTML = card.front.replace(/\n/g, '<br>').replace(/\{\{([^}]+)\}\}/g, '<span class="cloze-revealed">$1</span>') +
                (card.back ? `<hr style="margin: 1rem 0"><div>${card.back.replace(/\n/g, '<br>')}</div>` : '');
        } else {
            // Basic cards - preserve line breaks
            frontContent.innerHTML = card.front.replace(/\n/g, '<br>');
            backContent.innerHTML = card.back.replace(/\n/g, '<br>');
        }
    }

    // Flip card
    document.getElementById('flip-card').addEventListener('click', flipCard);

    function flipCard() {
        const flashcard = document.getElementById('flashcard');
        flashcard.classList.toggle('flipped');

        // Show rating controls after flip
        if (flashcard.classList.contains('flipped')) {
            document.getElementById('flip-controls').style.display = 'none';
            document.getElementById('rating-controls').style.display = 'flex';
        } else {
            document.getElementById('flip-controls').style.display = 'flex';
            document.getElementById('rating-controls').style.display = 'none';
        }
    }

    // Card rating
    document.querySelectorAll('#rating-controls button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const difficulty = e.target.closest('button').getAttribute('data-difficulty');
            if (difficulty) {
                processCardRating(difficulty);
            }
        });
    });

    // Go back to previous card
    document.getElementById('previous-card').addEventListener('click', () => {
        goBackToPreviousCard();
    });

    function goBackToPreviousCard() {
        // Check if there are any completed cards to go back to
        if (completedCardsHistory.length === 0) {
            showToast('Info', 'No previous cards to go back to', 'info');
            return;
        }

        // Get the last completed card
        const previousCardData = completedCardsHistory.pop();
        
        // Restore the original card state (revert the progress)
        const originalCard = findOriginalCard(previousCardData.card);
        if (originalCard) {
            // If this card was added to "again" cards, remove it since we're reverting
            if (originalCard.lastPerformance === 'again') {
                const againIndex = againCards.findIndex(card => card.id === originalCard.id);
                if (againIndex !== -1) {
                    againCards.splice(againIndex, 1);
                }
            }
            
            originalCard.lastReviewed = previousCardData.originalState.lastReviewed;
            originalCard.lastPerformance = previousCardData.originalState.lastPerformance;
            originalCard.interval = previousCardData.originalState.interval;
            originalCard.ease = previousCardData.originalState.ease;
            originalCard.status = previousCardData.originalState.status;
            
            // Save the reverted state
            saveDecks();
        }
        
        // Simply go back to the previous card position - don't add cards to queue
        currentCardIndex = Math.max(0, currentCardIndex - 1);
        
        // Show the previous card using the normal flow
        showCurrentCard();
        
        // Save the updated study session
        saveStudySession();
        
        showToast('Success', 'Reverted to previous card', 'success');
    }

    // Session completion
    function completeStudySession() {
        // Update total cards studied count
        statistics.totalStudied += cardsToStudy.length;
        saveStatistics();

        // Clear study session
        clearStudySession();
        updateResumeButton();

        // Automatically return to main page
        document.getElementById('study-overlay').classList.remove('active');
        document.body.classList.remove('study-mode');
        
        // Refresh deck list to show updated hard button status
        renderDeckList();
        updateStatistics();
        
        // Show a toast notification for completion
        showToast('Success', `Session complete! Reviewed ${cardsToStudy.length} cards`, 'success');
    }

    document.getElementById('restart-session').addEventListener('click', () => {
        if (currentStudyingDeck) {
            // Reset all cards in the deck to make them available for study again
            if (decks[currentStudyingDeck]) {
                decks[currentStudyingDeck].forEach(card => {
                    card.lastReviewed = null;
                    card.interval = 1;
                    card.status = 'new';
                    card.lastPerformance = null;
                });
                saveDecks();
            }
            startStudySession(currentStudyingDeck);
        }
    });

    document.getElementById('return-to-decks').addEventListener('click', () => {
        document.getElementById('study-overlay').classList.remove('active');
        document.body.classList.remove('study-mode');
    });

    // Process card rating and apply spaced repetition algorithm
    function processCardRating(difficulty) {
        if (currentCardIndex >= cardsToStudy.length) return;

        const card = cardsToStudy[currentCardIndex];
        const originalCard = findOriginalCard(card);

        if (!originalCard) return;

        // Add the current card to completed history before processing
        // Store a copy of the card and its original state for potential rollback
        completedCardsHistory.push({
            card: {...card},
            originalState: {
                lastReviewed: originalCard.lastReviewed,
                lastPerformance: originalCard.lastPerformance,
                interval: originalCard.interval,
                ease: originalCard.ease,
                status: originalCard.status
            },
            cardIndex: currentCardIndex
        });

        // Update last reviewed time and performance
        originalCard.lastReviewed = new Date().toISOString();
        originalCard.lastPerformance = difficulty;

        // If rated "again", add to again cards for replay
        if (difficulty === 'again') {
            againCards.push({...originalCard});
            // Update total count to reflect the additional card
            document.getElementById('total-count').textContent = cardsToStudy.length + againCards.length;
        }

        // Apply SM-2 algorithm
        switch (difficulty) {
            case 'again':
                originalCard.interval = 1;
                originalCard.ease = Math.max(1.3, originalCard.ease - 0.2);
                break;
            case 'hard':
                originalCard.interval = Math.max(1, Math.ceil(originalCard.interval * 1.2));
                originalCard.ease = Math.max(1.3, originalCard.ease - 0.15);
                break;
            case 'good':
                originalCard.interval = Math.ceil(originalCard.interval * originalCard.ease);
                break;
            case 'easy':
                originalCard.interval = Math.ceil(originalCard.interval * originalCard.ease * 1.3);
                originalCard.ease = Math.min(2.5, originalCard.ease + 0.15);

                // Count as mastered if interval is large enough
                if (originalCard.interval > 30 && originalCard.status !== 'mastered') {
                    originalCard.status = 'mastered';
                    statistics.cardsMastered++;
                    saveStatistics();
                }
                break;
        }

        // Update card status if not mastered
        if (originalCard.status !== 'mastered') {
            originalCard.status = 'learning';
        }

        // Save changes
        saveDecks();

        // Move to next card
        currentCardIndex++;
        
        // Save study session progress
        saveStudySession();
        
        showCurrentCard();

        // Update daily statistics
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        if (!statistics.dailyStats[today]) {
            statistics.dailyStats[today] = { studied: 0, mastered: 0 };
        }
        statistics.dailyStats[today].studied++;
        saveStatistics();
    }

    // Find the original card in the deck
    function findOriginalCard(card) {
        if (!currentStudyingDeck || !card.id) return null;

        for (let i = 0; i < decks[currentStudyingDeck].length; i++) {
            if (decks[currentStudyingDeck][i].id === card.id) {
                return decks[currentStudyingDeck][i];
            }
        }

        return null;
    }

    // Update statistics
    function updateStatistics() {
        // Count total cards and decks
        let totalCards = 0;
        for (const deckName in decks) {
            totalCards += decks[deckName].length;
        }

        document.getElementById('total-cards-stat').textContent = totalCards;
        document.getElementById('total-decks-stat').textContent = Object.keys(decks).length;
        document.getElementById('cards-studied-stat').textContent = getCardsStudiedToday();

        // Update due cards summary
        updateDueCardsSummary();
    }

    function updateDueCardsSummary() {
        let dueToday = 0;
        let dueTomorrow = 0;
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);

        for (const deckName in decks) {
            for (const card of decks[deckName]) {
                if (card.lastReviewed) {
                    const lastReviewed = new Date(card.lastReviewed);
                    const dueDate = new Date(lastReviewed);
                    dueDate.setDate(dueDate.getDate() + card.interval);
                    const dueDateStr = dueDate.toISOString().slice(0, 10);
                    
                    if (dueDateStr === today || dueDateStr < today) {
                        dueToday++;
                    } else if (dueDateStr === tomorrowStr) {
                        dueTomorrow++;
                    }
                } else {
                    // New cards are considered due today
                    dueToday++;
                }
            }
        }

        document.getElementById('due-today').textContent = dueToday;
        document.getElementById('due-tomorrow').textContent = dueTomorrow;
    }

    function updateStudyStreak() {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        if (!statistics.lastStudyDate || statistics.lastStudyDate !== today) {
            // Check if the last study was yesterday
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);

            if (statistics.lastStudyDate === yesterdayStr) {
                // Increment streak if last study was yesterday
                statistics.streak = (statistics.streak || 0) + 1;
            } else if (!statistics.lastStudyDate || statistics.lastStudyDate !== today) {
                // Reset streak if not consecutive
                statistics.streak = 1;
            }

            statistics.lastStudyDate = today;
            saveStatistics();
        }
    }

    function getCardsStudiedToday() {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        let count = 0;
        for (const deckName in decks) {
            decks[deckName].forEach(card => {
                if (card.lastReviewed && card.lastReviewed.startsWith(today)) {
                    count++;
                }
            });
        }

        return count;
    }

    // Export function for individual decks
    function exportDeck(deckName) {
        if (!decks[deckName] || decks[deckName].length === 0) {
            showToast('Error', `No cards in "${deckName}" to export`, 'error');
            return;
        }

        const exportData = {
            name: deckName,
            cards: decks[deckName],
            exportDate: new Date().toISOString()
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportName = `${deckName.replace(/\s+/g, '_')}_flashcards.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportName);
        linkElement.click();

        showToast('Success', `Exported deck "${deckName}" successfully`, 'success');
    }

    document.getElementById('import-deck').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);

                if (!importedData.name || !Array.isArray(importedData.cards)) {
                    showToast('Error', 'Invalid file format', 'error');
                    return;
                }

                const deckName = importedData.name;

                // Check if deck already exists
                if (decks[deckName] && !confirm(`Deck "${deckName}" already exists. Merge with existing deck?`)) {
                    return;
                }

                // Create or update deck
                if (!decks[deckName]) {
                    decks[deckName] = [];
                }

                // Add cards, ensuring they have IDs
                importedData.cards.forEach(card => {
                    if (!card.id) {
                        card.id = generateId();
                    }
                    // Ensure card has all needed properties
                    if (!card.type) card.type = 'basic';
                    if (!card.tags) card.tags = [];
                    if (!card.interval) card.interval = 1;
                    if (!card.ease) card.ease = 2.5;
                    if (!card.status) card.status = 'new';

                    decks[deckName].push(card);
                });

                // Save and update UI
                saveDecks();
                renderDeckList();

                showToast('Success', `Imported ${importedData.cards.length} cards to "${deckName}"`, 'success');
            } catch (error) {
                console.error('Import error:', error);
                showToast('Error', 'Could not parse file. Make sure it is a valid JSON file.', 'error');
            }
        };

        reader.readAsText(file);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only process if we're in study mode
        if (!document.getElementById('study-overlay').classList.contains('active') ||
            document.getElementById('study-card-container').style.display === 'none') {
            return;
        }

        switch (e.key) {
            case ' ': // Space bar for flipping
                e.preventDefault();
                flipCard();
                break;
            case '1': // Again
                if (document.getElementById('flashcard').classList.contains('flipped')) {
                    processCardRating('again');
                }
                break;
            case '2': // Hard
                if (document.getElementById('flashcard').classList.contains('flipped')) {
                    processCardRating('hard');
                }
                break;
            case '3': // Good
                if (document.getElementById('flashcard').classList.contains('flipped')) {
                    processCardRating('good');
                }
                break;
            case '4': // Easy
                if (document.getElementById('flashcard').classList.contains('flipped')) {
                    processCardRating('easy');
                }
                break;
            case 'e': // Edit current card
            case 'E':
                if (currentCardIndex < cardsToStudy.length) {
                    const card = cardsToStudy[currentCardIndex];
                    editingCardId = card.id;
                    document.getElementById('edit-card-front').value = card.front;
                    document.getElementById('edit-card-back').value = card.back;
                    document.getElementById('edit-card-modal').classList.add('active');
                }
                break;
        }
    });

    // Toast notification
    function showToast(title, message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastTitle = toast.querySelector('.toast-title');
        const toastMessage = toast.querySelector('.toast-message');
        const toastIcon = toast.querySelector('.toast-icon i');

        // Set content
        toastTitle.textContent = title;
        toastMessage.textContent = message;

        // Set icon and class based on type
        switch (type) {
            case 'success':
                toastIcon.className = 'fas fa-check-circle';
                toast.className = 'toast success';
                break;
            case 'error':
                toastIcon.className = 'fas fa-exclamation-circle';
                toast.className = 'toast error';
                break;
            case 'info':
                toastIcon.className = 'fas fa-info-circle';
                toast.className = 'toast info';
                break;
        }

        // Show the toast
        toast.classList.add('active');

        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }

    document.getElementById('toast').querySelector('.toast-close').addEventListener('click', () => {
        document.getElementById('toast').classList.remove('active');
    });

    // Helper functions
    function saveDecks() {
        localStorage.setItem('flashcards-decks', JSON.stringify(decks));
    }

    function saveStatistics() {
        localStorage.setItem('flashcards-stats', JSON.stringify(statistics));
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }


    // Open create/edit deck modal
    function openCreateDeckModal(editing, deckName = '') {
        isEditingDeck = editing;
        editingDeckName = editing ? deckName : null;
        
        // Update modal title and show save button
        const title = document.getElementById('create-deck-title');
        const saveDeckBtn = document.getElementById('save-deck');
        if (editing) {
            title.innerHTML = '<i class="fas fa-edit"></i> Edit Deck';
        } else {
            title.innerHTML = '<i class="fas fa-plus"></i> Create New Deck';
        }
        saveDeckBtn.style.display = 'inline-flex';
        
        // Clear form
        document.getElementById('deck-name').value = editing ? deckName : '';
        document.getElementById('card-front').value = '';
        document.getElementById('card-back').value = '';
        clearTags();
        
        // Always show sidebar
        document.getElementById('cards-sidebar').style.display = 'flex';
        
        if (editing && decks[deckName]) {
            // Get unique tags from deck
            const uniqueTags = new Set();
            decks[deckName].forEach(card => {
                if (card.tags) {
                    card.tags.forEach(tag => uniqueTags.add(tag));
                }
            });
            
            // Add tags to modal
            uniqueTags.forEach(tag => {
                addTag(tag);
            });
            
            // Populate existing cards
            renderExistingCards(deckName);
        } else {
            // Initialize empty sidebar for new deck
            renderExistingCards('');
        }
        
        document.getElementById('create-deck-modal').classList.add('active');
        document.getElementById('deck-name').focus();
    }

    // Edit deck functionality
    function editDeck(deckName) {
        openCreateDeckModal(true, deckName);
    }

    // Render existing cards in sidebar
    function renderExistingCards(deckName) {
        const cardsList = document.getElementById('existing-cards-list');
        const cardCount = document.getElementById('card-count');
        
        if (!decks[deckName] || decks[deckName].length === 0) {
            cardsList.innerHTML = '<div class="empty-message">No cards yet</div>';
            cardCount.textContent = '0';
            return;
        }

        cardCount.textContent = decks[deckName].length;
        cardsList.innerHTML = '';

        decks[deckName].forEach((card, index) => {
            const cardItem = document.createElement('div');
            cardItem.className = 'card-item';
            cardItem.draggable = true;
            cardItem.dataset.cardId = card.id;
            cardItem.dataset.index = index;

            cardItem.innerHTML = `
                <div class="card-preview">
                    <div class="card-front-preview">${card.front.replace(/\n/g, '<br>')}</div>
                    <div class="card-actions">
                        <button class="card-action-btn edit" data-card-id="${card.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="card-action-btn delete" data-card-id="${card.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;

            // Add drag and drop event listeners
            cardItem.addEventListener('dragstart', handleDragStart);
            cardItem.addEventListener('dragover', handleDragOver);
            cardItem.addEventListener('drop', handleDrop);
            cardItem.addEventListener('dragend', handleDragEnd);

            cardsList.appendChild(cardItem);
        });
    }

    // Drag and drop handlers
    let draggedElement = null;

    function handleDragStart(e) {
        draggedElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        
        this.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        if (draggedElement !== this) {
            const deckName = editingDeckName;
            const draggedIndex = parseInt(draggedElement.dataset.index);
            const targetIndex = parseInt(this.dataset.index);

            // Reorder cards in deck
            const cards = decks[deckName];
            const draggedCard = cards.splice(draggedIndex, 1)[0];
            cards.splice(targetIndex, 0, draggedCard);

            saveDecks();
            renderExistingCards(deckName);
            renderDeckList();
        }

        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.card-item').forEach(item => {
            item.classList.remove('drag-over');
        });
    }

    // Edit card functionality
    function editCardInSidebar(cardId) {
        const deckName = editingDeckName;
        const card = decks[deckName].find(c => c.id === cardId);
        
        if (card) {
            document.getElementById('card-front').value = card.front;
            document.getElementById('card-back').value = card.back;
            editingCardId = cardId;
            
            // Change add button to update button
            const addButton = document.getElementById('add-card');
            addButton.innerHTML = '<i class="fas fa-save"></i> Update Card';
            addButton.dataset.mode = 'update';
        }
    }

    // Delete card functionality
    function deleteCardFromSidebar(cardId) {
        const deckName = editingDeckName;
        const cardIndex = decks[deckName].findIndex(c => c.id === cardId);
        
        if (cardIndex !== -1) {
            const card = decks[deckName][cardIndex];
            if (confirm(`Delete card "${card.front}"?`)) {
                decks[deckName].splice(cardIndex, 1);
                saveDecks();
                renderExistingCards(deckName);
                renderDeckList();
                showToast('Success', 'Card deleted', 'success');
            }
        }
    }

    // Study session persistence
    function saveStudySession() {
        if (currentStudyingDeck && cardsToStudy.length > 0) {
            studySession = {
                deckName: currentStudyingDeck,
                cardsToStudy: cardsToStudy,
                currentCardIndex: currentCardIndex,
                againCards: againCards,
                completedCardsHistory: completedCardsHistory,
                timestamp: Date.now()
            };
            localStorage.setItem('current-study-session', JSON.stringify(studySession));
        }
    }

    function clearStudySession() {
        studySession = null;
        localStorage.removeItem('current-study-session');
    }

    function canResumeSession() {
        if (!studySession) return false;
        
        // Check if session is less than 24 hours old
        const hoursSinceSession = (Date.now() - studySession.timestamp) / (1000 * 60 * 60);
        return hoursSinceSession < 24 && studySession.cardsToStudy && studySession.cardsToStudy.length > 0;
    }

    function resumeStudySession() {
        if (!canResumeSession()) return false;
        
        currentStudyingDeck = studySession.deckName;
        cardsToStudy = studySession.cardsToStudy;
        currentCardIndex = studySession.currentCardIndex;
        againCards = studySession.againCards || [];
        completedCardsHistory = studySession.completedCardsHistory || [];
        
        // Show study overlay and hide main content
        document.getElementById('study-overlay').classList.add('active');
        document.body.classList.add('study-mode');
        document.getElementById('study-deck-name').textContent = `Resuming: ${currentStudyingDeck}`;
        
        // Update UI
        document.getElementById('total-count').textContent = cardsToStudy.length;
        document.getElementById('remaining-count').textContent = cardsToStudy.length - currentCardIndex;
        
        if (currentCardIndex < cardsToStudy.length) {
            document.getElementById('study-card-container').style.display = 'block';
            document.getElementById('deck-selection').style.display = 'none';
            document.getElementById('session-complete').style.display = 'none';
            showCurrentCard();
        }
        
        return true;
    }

    // Save deck button handler
    document.getElementById('save-deck').addEventListener('click', () => {
        const deckName = document.getElementById('deck-name').value.trim();
        
        if (!deckName) {
            showToast('Error', 'Please enter a deck name', 'error');
            return;
        }
        
        if (isEditingDeck && editingDeckName) {
            // Editing existing deck
            const newDeckName = deckName;
            
            // Check if deck name changed and new name already exists
            if (editingDeckName !== newDeckName && decks[newDeckName]) {
                showToast('Error', 'A deck with that name already exists', 'error');
                return;
            }
            
            // Handle deck renaming
            if (editingDeckName !== newDeckName) {
                if (decks[editingDeckName]) {
                    decks[newDeckName] = decks[editingDeckName];
                    delete decks[editingDeckName];
                }
            }
            
            // Update all cards with current tags
            if (decks[newDeckName]) {
                decks[newDeckName].forEach(card => {
                    card.tags = [...currentTags];
                });
            }
            
            showToast('Success', `Deck "${newDeckName}" saved successfully`, 'success');
        } else {
            // Creating new deck
            if (decks[deckName]) {
                showToast('Error', 'A deck with that name already exists', 'error');
                return;
            }
            
            // Create the deck if it doesn't exist
            if (!decks[deckName]) {
                decks[deckName] = [];
            }
            
            // Update all cards with current tags
            if (decks[deckName]) {
                decks[deckName].forEach(card => {
                    card.tags = [...currentTags];
                });
            }
            
            showToast('Success', `Deck "${deckName}" created successfully`, 'success');
        }
        
        // Save changes
        saveDecks();
        
        // Close the modal and refresh UI
        document.getElementById('create-deck-modal').classList.remove('active');
        renderDeckList();
        updateStatistics();
    });

    // Create/Edit deck modal handlers
    document.getElementById('close-create-deck-modal').addEventListener('click', () => {
        document.getElementById('create-deck-modal').classList.remove('active');
    });

    // Add Cmd+Enter keybind for adding cards
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            const modal = document.getElementById('create-deck-modal');
            if (modal.classList.contains('active')) {
                e.preventDefault();
                document.getElementById('add-card').click();
            }
        }
    });


    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
            e.target.classList.remove('active');
        }
    });

    // Show/hide resume button
    function updateResumeButton() {
        const resumeBtn = document.getElementById('resume-session');
        if (canResumeSession()) {
            resumeBtn.style.display = 'inline-flex';
            resumeBtn.innerHTML = `<i class="fas fa-play"></i> Resume ${studySession.deckName}`;
        } else {
            resumeBtn.style.display = 'none';
        }
    }


    // Initialize UI
    renderDeckList();
    updateStatistics();
    updateResumeButton();
}); 