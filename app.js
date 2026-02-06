// app.js - Sentiment Analysis with Google Sheets Integration

// DOM Elements
const reviewTextarea = document.getElementById('review-text');
const analyzeBtn = document.getElementById('analyze-btn');
const sentimentResult = document.getElementById('sentiment-result');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const resetBtn = document.getElementById('reset-btn');
const exampleBtns = document.querySelectorAll('.example-btn');

// Google Sheets Configuration
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec'; // ЗАМЕНИТЕ на свой URL
const SHEET_NAME = 'SentimentAnalysis';
let isGoogleSheetsEnabled = false; // Флаг для включения/выключения отправки в Google Sheets

// Local ML Model
let sentimentPipeline = null;

// Initialize the sentiment analysis model
async function initializeModel() {
  try {
    console.log('Loading sentiment analysis model...');
    
    // Load the sentiment analysis pipeline from Hugging Face
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
    
    // Load the model (you can change to other models like 'distilbert-base-uncased-finetuned-sst-2-english')
    sentimentPipeline = await pipeline('sentiment-analysis', 'Xenova/bert-base-multilingual-uncased-sentiment');
    
    console.log('Model loaded successfully');
    
    // Check Google Sheets configuration
    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.includes('YOUR_SCRIPT_ID')) {
      console.warn('Google Sheets integration is not configured. Please update GOOGLE_SCRIPT_URL.');
      isGoogleSheetsEnabled = false;
    } else {
      isGoogleSheetsEnabled = true;
      console.log('Google Sheets integration is enabled');
    }
    
    // Enable analyze button
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze Sentiment';
    
  } catch (error) {
    console.error('Failed to load model:', error);
    showError('Failed to load sentiment analysis model. Please refresh the page.');
    analyzeBtn.textContent = 'Model Failed to Load';
  }
}

// Analyze button click handler
analyzeBtn.addEventListener('click', () => {
  const reviewText = reviewTextarea.value.trim();
  
  if (!reviewText) {
    showError('Please enter a review text to analyze.');
    return;
  }
  
  if (!sentimentPipeline) {
    showError('Sentiment model is still loading. Please wait.');
    return;
  }
  
  hideError();
  analyzeReview(reviewText);
});

// Reset button click handler
resetBtn.addEventListener('click', () => {
  reviewTextarea.value = '';
  sentimentResult.innerHTML = '';
  sentimentResult.className = 'sentiment-result';
  hideError();
});

// Example buttons click handlers
exampleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const exampleText = btn.getAttribute('data-text');
    reviewTextarea.value = exampleText;
    hideError();
  });
});

// Main analysis function
function analyzeReview(reviewText) {
  // Show loading state
  loadingElement.style.display = "block";
  analyzeBtn.disabled = true;
  sentimentResult.innerHTML = ""; // Reset previous result
  sentimentResult.className = "sentiment-result"; // Reset classes

  // Call local sentiment model
  analyzeSentiment(reviewText)
    .then((result) => {
      displaySentiment(result);
      return { review: reviewText, result: result };
    })
    .then((data) => {
      // Save to Google Sheets if enabled
      if (isGoogleSheetsEnabled) {
        saveToGoogleSheets(data.review, data.result)
          .then(() => console.log('Data saved to Google Sheets'))
          .catch(err => console.warn('Google Sheets save failed:', err));
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      showError(error.message || "Failed to analyze sentiment.");
    })
    .finally(() => {
      loadingElement.style.display = "none";
      analyzeBtn.disabled = false;
    });
}

// Analyze sentiment using transformers.js
async function analyzeSentiment(text) {
  if (!sentimentPipeline) {
    throw new Error("Sentiment model is not initialized.");
  }

  // Truncate text if too long (models have token limits)
  const truncatedText = text.length > 1000 ? text.substring(0, 1000) + "..." : text;
  
  try {
    const output = await sentimentPipeline(truncatedText);
    
    if (!Array.isArray(output) || output.length === 0) {
      throw new Error("Invalid sentiment output from model.");
    }
    
    // Wrap to match [[{ label, score }]] format
    return [output];
  } catch (error) {
    console.error('Model inference error:', error);
    throw new Error("Analysis failed. Please try again.");
  }
}

// Display sentiment result
function displaySentiment(result) {
  let sentiment = "neutral";
  let score = 0.5;
  let label = "NEUTRAL";

  // Parse sentiment result
  if (
    Array.isArray(result) &&
    result.length > 0 &&
    Array.isArray(result[0]) &&
    result[0].length > 0
  ) {
    const sentimentData = result[0][0];

    if (sentimentData && typeof sentimentData === "object") {
      label = typeof sentimentData.label === "string"
        ? sentimentData.label.toUpperCase()
        : "NEUTRAL";
      score = typeof sentimentData.score === "number"
        ? sentimentData.score
        : 0.5;

      // Determine sentiment category
      if (label.includes("POSITIVE") && score > 0.5) {
        sentiment = "positive";
      } else if (label.includes("NEGATIVE") && score > 0.5) {
        sentiment = "negative";
      } else if (label.includes("NEUTRAL") && score > 0.5) {
        sentiment = "neutral";
      } else {
        // Fallback based on score
        if (score > 0.66) {
          sentiment = "positive";
          label = "POSITIVE";
        } else if (score < 0.34) {
          sentiment = "negative";
          label = "NEGATIVE";
        } else {
          sentiment = "neutral";
          label = "NEUTRAL";
        }
      }
    }
  }

  // Update UI
  sentimentResult.classList.add(sentiment);
  const icon = getSentimentIcon(sentiment);
  const confidence = (score * 100).toFixed(1);
  
  sentimentResult.innerHTML = `
    <div class="sentiment-header">
      <i class="fas ${icon} sentiment-icon"></i>
      <h3>${sentiment.toUpperCase()} SENTIMENT</h3>
    </div>
    <div class="sentiment-details">
      <p><strong>Label:</strong> ${label}</p>
      <p><strong>Confidence:</strong> ${confidence}%</p>
      <p><strong>Score:</strong> ${score.toFixed(4)}</p>
    </div>
    <div class="sentiment-explanation">
      <p>${getSentimentExplanation(sentiment, confidence)}</p>
    </div>
  `;
  
  // Add animation
  sentimentResult.style.animation = 'fadeIn 0.5s ease-in-out';
  
  // Log result
  console.log(`Sentiment: ${sentiment}, Label: ${label}, Confidence: ${confidence}%`);
}

// Get sentiment icon
function getSentimentIcon(sentiment) {
  switch (sentiment) {
    case "positive":
      return "fa-smile";
    case "negative":
      return "fa-frown";
    default:
      return "fa-meh";
  }
}

// Get sentiment explanation
function getSentimentExplanation(sentiment, confidence) {
  const highConfidence = parseFloat(confidence) > 80;
  
  switch (sentiment) {
    case "positive":
      return highConfidence 
        ? "This review expresses strong positive sentiment. The customer is very satisfied."
        : "This review shows positive sentiment with moderate confidence.";
    case "negative":
      return highConfidence
        ? "This review expresses strong negative sentiment. Immediate attention may be needed."
        : "This review shows negative sentiment with moderate confidence.";
    default:
      return "This review shows neutral or mixed sentiment. The customer may have both positive and negative points.";
  }
}

// Save data to Google Sheets
async function saveToGoogleSheets(reviewText, sentimentResult) {
  if (!isGoogleSheetsEnabled) {
    console.log('Google Sheets integration is disabled');
    return Promise.resolve();
  }

  try {
    // Parse sentiment data
    let sentiment = "neutral";
    let score = 0.5;
    let label = "NEUTRAL";

    if (Array.isArray(sentimentResult) && sentimentResult[0]?.[0]) {
      const sentimentData = sentimentResult[0][0];
      label = sentimentData.label?.toUpperCase() || "NEUTRAL";
      score = sentimentData.score || 0.5;
      
      if (label.includes("POSITIVE") && score > 0.5) {
        sentiment = "positive";
      } else if (label.includes("NEGATIVE") && score > 0.5) {
        sentiment = "negative";
      }
    }

    // Prepare data
    const data = {
      timestamp: new Date().toISOString(),
      review: reviewText.substring(0, 500), // Limit review length
      sentiment: sentiment,
      label: label,
      score: score.toFixed(4),
      confidence: (score * 100).toFixed(1),
      source: 'Web App'
    };

    // Method 1: POST request (recommended)
    return await saveViaPost(data);
    
    // Method 2: GET request (alternative)
    // return await saveViaGet(data);
    
  } catch (error) {
    console.error('Error preparing Google Sheets data:', error);
    throw error;
  }
}

// Save via POST request
async function saveViaPost(data) {
  try {
    const payload = {
      action: 'append',
      sheet: SHEET_NAME,
      data: data
    };

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Use 'cors' if CORS is configured
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    // Note: With 'no-cors' we can't read the response
    console.log('Data sent to Google Sheets via POST');
    return true;
  } catch (error) {
    console.warn('POST request failed, trying GET method...');
    // Fallback to GET method
    return await saveViaGet(data);
  }
}

// Save via GET request
async function saveViaGet(data) {
  try {
    const params = new URLSearchParams({
      action: 'append',
      timestamp: data.timestamp,
      review: encodeURIComponent(data.review.substring(0, 200)), // Shorter for URL
      sentiment: data.sentiment,
      label: data.label,
      score: data.score,
      confidence: data.confidence,
      source: data.source
    });

    const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
    await fetch(url, { mode: 'no-cors' });
    
    console.log('Data sent to Google Sheets via GET');
    return true;
  } catch (error) {
    console.error('GET request also failed:', error);
    throw new Error('Failed to save to Google Sheets');
  }
}

// Toggle Google Sheets integration
function toggleGoogleSheetsIntegration(enable) {
  isGoogleSheetsEnabled = enable;
  const status = enable ? 'ENABLED' : 'DISABLED';
  console.log(`Google Sheets integration: ${status}`);
  
  // Show notification
  showNotification(`Google Sheets integration ${status.toLowerCase()}`, enable ? 'success' : 'warning');
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#4CAF50' : type === 'warning' ? '#ff9800' : '#2196F3'};
    color: white;
    border-radius: 4px;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Show error message
function showError(message) {
  errorElement.textContent = message;
  errorElement.style.display = "block";
  errorElement.style.animation = "shake 0.5s ease-in-out";
  
  // Remove animation after it plays
  setTimeout(() => {
    errorElement.style.animation = "";
  }, 500);
}

// Hide error message
function hideError() {
  errorElement.style.display = "none";
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter to analyze
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    analyzeBtn.click();
  }
  
  // Escape to reset
  if (e.key === 'Escape') {
    resetBtn.click();
  }
});

// Copy to clipboard function
function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => showNotification('Copied to clipboard!', 'success'))
    .catch(err => console.error('Copy failed:', err));
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing sentiment analysis app...');
  
  // Add copy button to review textarea
  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
  copyBtn.className = 'copy-btn';
  copyBtn.title = 'Copy review text';
  copyBtn.addEventListener('click', () => {
    if (reviewTextarea.value.trim()) {
      copyToClipboard(reviewTextarea.value);
    }
  });
  
  reviewTextarea.parentNode.appendChild(copyBtn);
  
  // Initialize the model
  initializeModel();
  
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
      20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    .copy-btn {
      position: absolute;
      right: 10px;
      top: 10px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 5px 10px;
      cursor: pointer;
      transition: background 0.3s;
    }
    
    .copy-btn:hover {
      background: #0056b3;
    }
    
    .notification {
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .sentiment-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .sentiment-icon {
      font-size: 24px;
    }
    
    .sentiment-details {
      background: rgba(255,255,255,0.1);
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
    }
    
    .sentiment-details p {
      margin: 5px 0;
    }
  `;
  document.head.appendChild(style);
  
  // Demo: Enable/disable Google Sheets button (for testing)
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle-google-sheets';
  toggleBtn.textContent = 'Toggle Google Sheets';
  toggleBtn.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    padding: 8px 16px;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    z-index: 100;
  `;
  toggleBtn.addEventListener('click', () => {
    toggleGoogleSheetsIntegration(!isGoogleSheetsEnabled);
  });
  
  document.body.appendChild(toggleBtn);
  
  console.log('App initialized successfully');
});

// Export functions for debugging (optional)
window.appDebug = {
  analyzeSentiment,
  saveToGoogleSheets,
  toggleGoogleSheetsIntegration,
  get isGoogleSheetsEnabled() { return isGoogleSheetsEnabled; }
};
