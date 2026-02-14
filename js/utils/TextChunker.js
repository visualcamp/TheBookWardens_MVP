
export class TextChunker {
    /**
     * Splits tokens into semantic chunks based on WPM.
     * @param {Array} tokens - Array of {t, b} objects
     * @param {number} wpm - Words Per Minute
     * @param {Array} highlights - Array of {target_token_index, type, word_id}
     * @returns {Array} Array of Arrays of Token Objects
     */
    static process(tokens, wpm, highlights = []) {
        const chunks = [];
        let currentChunk = [];

        // Define WPM Bands
        let band = 'mid'; // Default
        if (wpm < 150) band = 'low';       // Novice
        else if (wpm < 250) band = 'mid';  // Apprentice (Target: 200)
        else band = 'high';                // Master (300+)

        // Loop through tokens
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const tokenObj = { ...token, originalIndex: i };
            currentChunk.push(tokenObj);

            let shouldBreak = false;
            const len = currentChunk.length;

            // --- 0. Absolute Hard Breaks (Always Break) ---
            if (token.b === 4) shouldBreak = true; // Paragraph/Sentence End

            // --- 1. Band-Specific Logic ---
            else if (band === 'low') {
                // Novice: Very short chunks (1-2 words).
                // Break on ANY pause (b>=1) if we have at least 1 word.
                // Force break at 3 words.
                if (len >= 3) shouldBreak = true;
                else if (len >= 1 && token.b >= 1) shouldBreak = true;
            }
            else if (band === 'mid') {
                // Apprentice (200 WPM): Sense Groups (3-4 words).
                // [THE FIX]: Before, we waited for b>=3. Now we break on b>=2 (commas/phrases).
                // Also, Force break at 5 words max.
                if (len >= 5) shouldBreak = true; // Hard Limit
                else if (len >= 3 && token.b >= 2) shouldBreak = true; // Normal flow
                else if (len >= 2 && token.b >= 3) shouldBreak = true; // Short phrase end
            }
            else { // 'high'
                // Master: Long chunks (6-8 words).
                // Ignore small pauses. Break on strong pauses (b>=3).
                if (len >= 10) shouldBreak = true; // Hard Limit
                else if (len >= 6 && token.b >= 2) shouldBreak = true;
                else if (len >= 4 && token.b >= 3) shouldBreak = true;
            }

            // --- 2. End of Data ---
            if (i === tokens.length - 1) shouldBreak = true;

            if (shouldBreak) {
                // Prevent empty chunks (sanity check)
                if (currentChunk.length > 0) {
                    chunks.push([...currentChunk]);
                    currentChunk = [];
                }
            }
        }

        return chunks;
    }
}
