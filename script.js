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
            document.querySelector('[data-tab="study"]').click();
        } else if (button.classList.contains('study-again-btn')) {
            const deckName = button.getAttribute('data-deck');
            startStudySession(deckName, 'again');
            document.querySelector('[data-tab="study"]').click();
        } else if (button.classList.contains('study-hard-btn')) {
            const deckName = button.getAttribute('data-deck');
            startStudySession(deckName, 'hard');
            document.querySelector('[data-tab="study"]').click();
        } else if (button.classList.contains('edit-deck-btn')) {
            const deckName = button.getAttribute('data-deck');
            editDeck(deckName);
        } else if (button.classList.contains('export-deck-btn')) {
            const deckName = button.getAttribute('data-deck');
            exportDeck(deckName);
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

    // Initialize tabs
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Special actions for specific tabs
            if (tabId === 'decks') {
                renderDeckList();
                updateStatistics();
            }
        });
    });

    // Set default card type to basic since we removed the toggle
    cardType = 'basic';

    // Tags input functionality
    const tagInput = document.getElementById('tag-input');
    const tagsContainer = document.getElementById('tags-container');

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

        const tag = document.createElement('div');
        tag.className = 'tag-item';
        tag.innerHTML = `
            ${tagText}
            <span class="tag-remove" data-tag="${tagText}"><i class="fas fa-times"></i></span>
        `;
        tagsContainer.insertBefore(tag, tagInput);
        currentTags.push(tagText);

        // Add event listener to remove tag
        tag.querySelector('.tag-remove').addEventListener('click', function() {
            const tagToRemove = this.getAttribute('data-tag');
            removeTag(tagToRemove);
        });
    }

    function removeTag(tagText) {
        const tagElements = document.querySelectorAll('.tag-item');
        tagElements.forEach(tag => {
            if (tag.textContent.trim().replace('×', '') === tagText) {
                tag.remove();
            }
        });

        currentTags = currentTags.filter(tag => tag !== tagText);
    }

    function clearTags() {
        const tagElements = document.querySelectorAll('.tag-item');
        tagElements.forEach(tag => tag.remove());
        currentTags = [];
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

        // Save to localStorage
        saveDecks();

        // Show toast notification
        showToast('Success', `Card added to "${deckName}"`, 'success');

        // Clear inputs but keep deck name and tags
        cardFrontInput.value = '';
        cardBackInput.value = '';
        cardFrontInput.focus();

        // Update deck list if visible
        if (document.getElementById('decks').classList.contains('active')) {
            renderDeckList();
        }
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
                    <div class="deck-color-tag" style="background-color: ${deckColor};"></div>
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
                                <i class="fas fa-book-open"></i> Study All
                            </button>
                            ${performanceCounts.again > 0 ? `<button class="study-again-btn btn-small danger" data-deck="${deckName}">Again (${performanceCounts.again})</button>` : ''}
                            ${performanceCounts.hard > 0 ? `<button class="study-hard-btn btn-small warning" data-deck="${deckName}">Hard (${performanceCounts.hard})</button>` : ''}
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
        document.querySelector('[data-tab="decks"]').click();
    });

    // Filter dropdown
    document.getElementById('filter-btn').addEventListener('click', () => {
        document.getElementById('filter-menu').classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        const filterMenu = document.getElementById('filter-menu');
        const filterBtn = document.getElementById('filter-btn');

        if (filterMenu.classList.contains('active') &&
            !filterMenu.contains(e.target) &&
            e.target !== filterBtn) {
            filterMenu.classList.remove('active');
        }
    });

    document.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.filter-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            document.getElementById('filter-menu').classList.remove('active');
            // Would implement actual filtering here
        });
    });

    // Deck search
    document.getElementById('deck-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        document.querySelectorAll('.deck-card').forEach(deck => {
            const deckName = deck.querySelector('.deck-title').textContent.toLowerCase();
            const tags = Array.from(deck.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());

            if (deckName.includes(searchTerm) || tags.some(tag => tag.includes(searchTerm))) {
                deck.style.display = '';
            } else {
                deck.style.display = 'none';
            }
        });
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
            cardsToStudy = decks[deckName].filter(card => card.lastPerformance === performanceFilter);
        } else {
            // Get due cards using the SM-2 algorithm
            cardsToStudy = getDueCards(deckName);
        }

        // Reset again cards for new session
        againCards = [];

        // Update study UI
        document.getElementById('total-count').textContent = cardsToStudy.length;
        document.getElementById('remaining-count').textContent = cardsToStudy.length;
        document.getElementById('study-progress').style.width = '0%';

        if (cardsToStudy.length > 0) {
            document.getElementById('study-card-container').style.display = 'block';
            document.getElementById('deck-selection').style.display = 'none';
            document.getElementById('session-complete').style.display = 'none';

            // Shuffle cards
            cardsToStudy = shuffleArray(cardsToStudy);
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
        if (!decks[deckName]) return { again: 0, hard: 0 };
        
        let againCount = 0;
        let hardCount = 0;
        
        decks[deckName].forEach(card => {
            if (card.lastPerformance === 'again') againCount++;
            else if (card.lastPerformance === 'hard') hardCount++;
        });
        
        return { again: againCount, hard: hardCount };
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
        document.getElementById('remaining-count').textContent = cardsToStudy.length - currentCardIndex;
        const progressPercentage = ((currentCardIndex) / cardsToStudy.length) * 100;
        document.getElementById('study-progress').style.width = `${progressPercentage}%`;
    }

    function updateCardDisplay(card) {
        // Update card content
        const frontContent = document.getElementById('card-front-content');
        const backContent = document.getElementById('card-back-content');

        // Handle cloze cards differently
        if (card.type === 'cloze') {
            // For front side, replace cloze with [...]
            frontContent.innerHTML = card.front.replace(/\{\{([^}]+)\}\}/g, '<span class="cloze">[...]</span>');

            // For back side, highlight the cloze content
            backContent.innerHTML = card.front.replace(/\{\{([^}]+)\}\}/g, '<span class="cloze-revealed">$1</span>') +
                (card.back ? `<hr style="margin: 1rem 0"><div>${card.back}</div>` : '');
        } else {
            // Basic cards
            frontContent.textContent = card.front;
            backContent.textContent = card.back;
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
            processCardRating(difficulty);
        });
    });

    // Session completion
    function completeStudySession() {
        // Update UI
        document.getElementById('study-card-container').style.display = 'none';
        document.getElementById('deck-selection').style.display = 'none';
        document.getElementById('session-complete').style.display = 'block';

        document.getElementById('session-summary').innerHTML = `
            <div>Cards Reviewed: ${cardsToStudy.length}</div>
        `;

        // Update total cards studied count
        statistics.totalStudied += cardsToStudy.length;
        saveStatistics();
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
        document.querySelector('[data-tab="decks"]').click();
    });

    // Process card rating and apply spaced repetition algorithm
    function processCardRating(difficulty) {
        if (currentCardIndex >= cardsToStudy.length) return;

        const card = cardsToStudy[currentCardIndex];
        const originalCard = findOriginalCard(card);

        if (!originalCard) return;

        // Update last reviewed time and performance
        originalCard.lastReviewed = new Date().toISOString();
        originalCard.lastPerformance = difficulty;

        // If rated "again", add to again cards for replay
        if (difficulty === 'again') {
            againCards.push({...originalCard});
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

        // Update forecast data in the UI
        updateForecast();
    }

    function updateForecast() {
        const forecastData = [];
        let totalDue = 0;
        const now = new Date();

        for (let day = 0; day < 7; day++) {
            const d = new Date();
            d.setDate(now.getDate() + day);
            const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

            // Count cards due for each day
            let dueThatDay = 0;
            for (const deckName in decks) {
                decks[deckName].forEach(card => {
                    if (card.lastReviewed) {
                        const lastReviewed = new Date(card.lastReviewed);
                        const dueDate = new Date(lastReviewed);
                        dueDate.setDate(dueDate.getDate() + card.interval);

                        // Check if due on this specific day
                        if (dueDate.toISOString().slice(0, 10) === d.toISOString().slice(0, 10)) {
                            dueThatDay++;
                        }
                    } else if (day === 0) {
                        // New cards are due today
                        dueThatDay++;
                    }
                });
            }

            totalDue += dueThatDay;
            forecastData.push({
                date: dateStr,
                due: dueThatDay
            });
        }

        // Update the forecast in the UI
        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = `
            <div style="padding: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <div style="font-weight: 600;">Next 7 Days</div>
                    <div style="color: var(--primary-color); font-weight: 600;">${totalDue} cards due</div>
                </div>
                ${forecastData.map(day => `
                    <div class="forecast-day">
                        <div class="forecast-date">${day.date}</div>
                        <div class="forecast-count">${day.due}</div>
                    </div>
                `).join('')}
            </div>
        `;
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
        if (!document.getElementById('study').classList.contains('active') ||
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

    function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    // Open create/edit deck modal
    function openCreateDeckModal(editing, deckName = '') {
        isEditingDeck = editing;
        editingDeckName = editing ? deckName : null;
        
        // Update modal title
        const title = document.getElementById('create-deck-title');
        if (editing) {
            title.innerHTML = '<i class="fas fa-edit"></i> Edit Deck';
        } else {
            title.innerHTML = '<i class="fas fa-plus"></i> Create New Deck';
        }
        
        // Clear form
        document.getElementById('deck-name').value = editing ? deckName : '';
        document.getElementById('card-front').value = '';
        document.getElementById('card-back').value = '';
        clearTags();
        
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
        }
        
        document.getElementById('create-deck-modal').classList.add('active');
        document.getElementById('deck-name').focus();
    }

    // Edit deck functionality
    function editDeck(deckName) {
        openCreateDeckModal(true, deckName);
    }

    // Create/Edit deck modal handlers
    document.getElementById('close-create-deck-modal').addEventListener('click', () => {
        document.getElementById('create-deck-modal').classList.remove('active');
    });

    // Initialize UI
    renderDeckList();
    updateStatistics();
}); 