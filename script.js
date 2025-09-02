document.addEventListener('DOMContentLoaded', function() {
    // Initialize state
    let decks = JSON.parse(localStorage.getItem('flashcards-decks')) || {};
    let currentStudyingDeck = null;
    let cardsToStudy = [];
    let currentCardIndex = 0;
    let studySessionStartTime = null;
    let sessionTimer = null;
    let editingCardId = null;
    let resettingDeckName = null;
    // dark mode removed
    let currentTags = [];
    let cardType = 'basic'; // 'basic' or 'cloze'

    // Fix for button interaction issues by using event delegation
    document.addEventListener('click', function(e) {
        // Find the closest button
        const button = e.target.closest('button');
        if (!button) return;

        // Check for specific buttons and trigger their handlers
        if (button.classList.contains('study-deck-btn')) {
            const deckName = button.getAttribute('data-deck') || (button.closest('.deck-item') && button.closest('.deck-item').querySelector('.deck-name') ? button.closest('.deck-item').querySelector('.deck-name').textContent : null);
            if (deckName) {
                startStudySession(deckName);
                // Single-page: scroll to study section
                document.getElementById('study').scrollIntoView({ behavior: 'smooth' });
            }
        } else if (button.classList.contains('reset-deck-btn')) {
            const deckName = button.getAttribute('data-deck') || (button.closest('.deck-item') && button.closest('.deck-item').querySelector('.deck-name') ? button.closest('.deck-item').querySelector('.deck-name').textContent : null);
            if (deckName) resetDeck(deckName);
        } else if (button.classList.contains('delete-deck-btn')) {
            const deckName = button.getAttribute('data-deck') || (button.closest('.deck-item') && button.closest('.deck-item').querySelector('.deck-name') ? button.closest('.deck-item').querySelector('.deck-name').textContent : null);
            if (deckName && confirm(`Are you sure you want to delete "${deckName}"? This cannot be undone.`)) {
                delete decks[deckName];
                saveDecks();
                renderDeckList();
                showToast('Success', `Deck "${deckName}" deleted`, 'info');
            }
        }
    });

    // dark mode removed

    // tabs removed; single-page layout

    // dark mode toggle removed

    // Card type toggle
    document.getElementById('basic-card-type').addEventListener('click', function() {
        setCardType('basic');
    });

    document.getElementById('cloze-card-type').addEventListener('click', function() {
        setCardType('cloze');
    });

    function setCardType(type) {
        cardType = type;
        document.getElementById('basic-card-type').classList.toggle('active', type === 'basic');
        document.getElementById('cloze-card-type').classList.toggle('active', type === 'cloze');

        // Update placeholder text based on card type
        if (type === 'basic') {
            document.getElementById('card-front').placeholder = 'Enter your question or prompt';
            document.getElementById('card-back').placeholder = 'Enter the answer or explanation';
        } else {
            document.getElementById('card-front').placeholder = 'Enter text with cloze deletions using {{...}} (e.g., The capital of France is {{Paris}})';
            document.getElementById('card-back').placeholder = 'Enter additional information (optional)';
        }
    }

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

        // Process cloze deletion cards
        if (cardType === 'cloze') {
            // Validate cloze format
            if (!front.includes('{{') || !front.includes('}}')) {
                showToast('Error', 'Cloze cards must include text in {{...}} format', 'error');
                return;
            }
        }

        // Create deck if it doesn't exist
        if (!decks[deckName]) {
            decks[deckName] = [];
        }

        // Add card to deck
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

        // Update recent cards
        addToRecentCards(newCard, deckName);

        // Refresh deck list so new/updated deck appears immediately
        renderDeckList();

        // Show toast notification
        showToast('Success', `Card added to "${deckName}"`, 'success');

        // Clear inputs but keep deck name and tags
        cardFrontInput.value = '';
        cardBackInput.value = '';
        cardFrontInput.focus();
    });

    // Clear form
    document.getElementById('clear-form').addEventListener('click', () => {
        deckNameInput.value = '';
        cardFrontInput.value = '';
        cardBackInput.value = '';
        clearTags();
        setCardType('basic');
    });

    // Function to add card to recent cards list
    function addToRecentCards(card, deckName) {
        const recentCardsList = document.getElementById('recent-cards');
        const cardElement = document.createElement('div');
        cardElement.className = 'card-list-item';
        cardElement.setAttribute('data-id', card.id);

        // Handle cloze cards display in recent list
        let frontDisplay = card.front;
        if (card.type === 'cloze') {
            frontDisplay = card.front.replace(/\{\{([^}]+)\}\}/g, '<span class="cloze">$1</span>');
        }

        cardElement.innerHTML = `
            <div class="card-question">${frontDisplay}</div>
            <div class="card-answer">${card.back}</div>
        `;

        cardElement.addEventListener('click', () => {
            // Show edit modal for this card
            editingCardId = card.id;
            document.getElementById('edit-card-front').value = card.front;
            document.getElementById('edit-card-back').value = card.back;
            document.getElementById('edit-card-modal').classList.add('active');
        });

        // Add at the beginning (most recent first)
        if (recentCardsList.firstChild) {
            recentCardsList.insertBefore(cardElement, recentCardsList.firstChild);
        } else {
            recentCardsList.appendChild(cardElement);
        }

        // Keep only the last 10 recent cards
        while (recentCardsList.children.length > 10) {
            recentCardsList.removeChild(recentCardsList.lastChild);
        }
    }

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

                        // Update the card in recent cards list if it exists
                        updateRecentCardDisplay(editingCardId, newFront, newBack);

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

    function updateRecentCardDisplay(cardId, newFront, newBack) {
        const recentCards = document.querySelectorAll('.card-list-item');
        for (let i = 0; i < recentCards.length; i++) {
            const card = recentCards[i];
            if (card.getAttribute('data-id') === cardId) {
                let frontDisplay = newFront;

                // Check if it's a cloze card
                if (newFront.includes('{{') && newFront.includes('}}')) {
                    frontDisplay = newFront.replace(/\{\{([^}]+)\}\}/g, '<span class="cloze">$1</span>');
                }

                card.querySelector('.card-question').innerHTML = frontDisplay;
                card.querySelector('.card-answer').textContent = newBack;
                break;
            }
        }
    }

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

    // Removed seeded example deck

    // Render simplified deck list
    function renderDeckList() {
        const deckList = document.getElementById('deck-list');
        const noDecks = document.getElementById('no-decks');
        deckList.innerHTML = '';

        const deckNames = Object.keys(decks);

        if (deckNames.length === 0) {
            deckList.style.display = 'none';
            noDecks.style.display = 'block';
        } else {
            deckList.style.display = 'block';
            noDecks.style.display = 'none';

            deckNames.forEach((deckName) => {
                const deckCards = decks[deckName];
                const dueCount = getDueCardsCount(deckName);

                const deckElement = document.createElement('div');
                deckElement.className = 'deck-item';
                deckElement.innerHTML = `
                    <div class="deck-main">
                        <div class="deck-name">${deckName}</div>
                        <div class="deck-meta">${deckCards.length} cards • ${dueCount} due • ${getLastStudiedDate(deckName)}</div>
                    </div>
                    <div class="deck-actions">
                        <button class="study-deck-btn" data-deck="${deckName}">
                            <i class="fas fa-book-open"></i> Study
                        </button>
                        <button class="action-btn reset-deck-btn" data-deck="${deckName}" title="Reset Progress">
                            <i class="fas fa-redo-alt"></i>
                        </button>
                        <button class="action-btn delete-deck-btn" data-deck="${deckName}" title="Delete Deck">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;

                deckList.appendChild(deckElement);
            });
        }
    }

    document.getElementById('create-first-deck').addEventListener('click', () => {
        document.getElementById('create').scrollIntoView({ behavior: 'smooth' });
    });

    document.getElementById('show-deck-list').addEventListener('click', () => {
        document.getElementById('decks').scrollIntoView({ behavior: 'smooth' });
    });

    // Filter UI removed

    // Deck search
    document.getElementById('deck-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        document.querySelectorAll('.deck-item').forEach(item => {
            const deckName = item.querySelector('.deck-name').textContent.toLowerCase();
            if (deckName.includes(searchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Study session
    function startStudySession(deckName) {
        if (!decks[deckName] || decks[deckName].length === 0) {
            showToast('Error', `No cards in deck "${deckName}"`, 'error');
            return;
        }

        currentStudyingDeck = deckName;
        document.getElementById('study-deck-name').textContent = deckName;

        // Get due cards using the SM-2 algorithm
        cardsToStudy = getDueCards(deckName);

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

            // Start session timer
            studySessionStartTime = new Date();
            if (sessionTimer) clearInterval(sessionTimer);
            // Assuming there's an element with id 'session-time' in the HTML
            const sessionTimeElement = document.getElementById('session-time');
            if (sessionTimeElement) {
                 sessionTimer = setInterval(updateSessionTime, 1000);
            } else {
                console.warn('Element with ID "session-time" not found. Session timer will not be displayed.');
            }

            // Show the first card
            showCurrentCard();

            // statistics removed
        } else {
            document.getElementById('study-card-container').style.display = 'none';
            document.getElementById('deck-selection').style.display = 'none';
            document.getElementById('session-complete').style.display = 'block';
            document.getElementById('session-summary').textContent = `All cards in "${deckName}" are up to date.`;
        }
    }

    function updateSessionTime() {
        if (!studySessionStartTime) return;

        const now = new Date();
        const elapsedMs = now - studySessionStartTime;
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);

        const sessionTimeElement = document.getElementById('session-time');
        if (sessionTimeElement) {
            sessionTimeElement.textContent =
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

    function showCurrentCard() {
        if (cardsToStudy.length === 0 || currentCardIndex >= cardsToStudy.length) {
            completeStudySession();
            return;
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
        // Stop the timer
        if (sessionTimer) {
            clearInterval(sessionTimer);
            sessionTimer = null;
        }

        // Update UI
        document.getElementById('study-card-container').style.display = 'none';
        document.getElementById('deck-selection').style.display = 'none';
        document.getElementById('session-complete').style.display = 'block';

        // Calculate session stats
        const sessionDuration = new Date() - studySessionStartTime;
        const minutes = Math.floor(sessionDuration / 60000);
        const seconds = Math.floor((sessionDuration % 60000) / 1000);
        const timeStr = `${minutes}m ${seconds}s`;

        document.getElementById('session-summary').innerHTML = `
            <div>Session Time: ${timeStr}</div>
            <div>Cards Reviewed: ${cardsToStudy.length}</div>
        `;

        // statistics removed
    }

    document.getElementById('restart-session').addEventListener('click', () => {
        if (currentStudyingDeck) {
            startStudySession(currentStudyingDeck);
        }
    });

    document.getElementById('return-to-decks').addEventListener('click', () => {
        document.getElementById('decks').scrollIntoView({ behavior: 'smooth' });
    });

    // Process card rating and apply spaced repetition algorithm
    function processCardRating(difficulty) {
        if (currentCardIndex >= cardsToStudy.length) return;

        const card = cardsToStudy[currentCardIndex];
        const originalCard = findOriginalCard(card);

        if (!originalCard) return;

        // Update last reviewed time
        originalCard.lastReviewed = new Date().toISOString();

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

        // statistics removed
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

    // statistics removed

    // Import/Export functions
    document.getElementById('export-deck').addEventListener('click', () => {
        const deckName = document.getElementById('deck-name').value.trim() || 'Default Deck';

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
    });

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
        // Only process if study card is visible
        if (document.getElementById('study-card-container').style.display === 'none') {
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

    // Initialize UI
    renderDeckList();
    updateStatistics();
}); 