
const MODEL_URL = './plant_disease_model.onnx';
const IMG_SIZE = 128;

let session = null;
let currentImage = null;
let webcamStream = null;

const elements = {};

function initElements() {
    elements.dropZone = document.getElementById('dropZone');
    elements.dropZoneContent = document.getElementById('dropZoneContent');
    elements.previewImage = document.getElementById('previewImage');
    elements.fileInput = document.getElementById('fileInput');
    elements.cameraBtn = document.getElementById('cameraBtn');
    elements.analyzeBtn = document.getElementById('analyzeBtn');
    elements.loadingState = document.getElementById('loadingState');
    elements.resultsSection = document.getElementById('resultsSection');
    elements.resultsList = document.getElementById('resultsList');
    elements.resetBtn = document.getElementById('resetBtn');
    elements.cameraModal = document.getElementById('cameraModal');
    elements.cameraVideo = document.getElementById('cameraVideo');
    elements.cameraCanvas = document.getElementById('cameraCanvas');
    elements.captureBtn = document.getElementById('captureBtn');
    elements.closeCameraModal = document.getElementById('closeCameraModal');
    elements.healthBadge = document.getElementById('healthBadge');
    elements.prescriptionCard = document.getElementById('prescriptionCard');
    elements.prescriptionTitle = document.getElementById('prescriptionTitle');
    elements.prescriptionContent = document.getElementById('prescriptionContent');
}

async function init() {
    console.log('Initializing Plant Doctor...');
    initElements();
    setupEventListeners();
    await loadModel();
}

async function loadModel() {
    try {
        console.log('Loading ONNX model from:', MODEL_URL);
        const startTime = performance.now();
        
        session = await ort.InferenceSession.create(MODEL_URL, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        
        const loadTime = performance.now() - startTime;
        console.log(`Model loaded in ${loadTime.toFixed(0)}ms`);
        console.log('Input names:', session.inputNames);
        console.log('Output names:', session.outputNames);
        
        console.log('Warming up model...');
        const dummyData = new Float32Array(1 * 3 * IMG_SIZE * IMG_SIZE);
        const dummyTensor = new ort.Tensor('float32', dummyData, [1, 3, IMG_SIZE, IMG_SIZE]);
        await session.run({ [session.inputNames[0]]: dummyTensor });
        
        console.log('Model ready for inference');
        
    } catch (error) {
        console.error('Failed to load model:', error);
        showError('Failed to load the AI model. Please refresh the page.');
    }
}

function setupEventListeners() {
    elements.dropZone.addEventListener('click', () => {
        elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageFile(e.target.files[0]);
        }
    });
    
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('drag-over');
    });
    
    elements.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
    });
    
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImageFile(e.dataTransfer.files[0]);
        }
    });
    
    elements.cameraBtn.addEventListener('click', openCamera);
    elements.analyzeBtn.addEventListener('click', analyzeImage);
    elements.resetBtn.addEventListener('click', resetState);
    elements.closeCameraModal.addEventListener('click', closeCamera);
    elements.captureBtn.addEventListener('click', capturePhoto);
    
    elements.cameraModal.addEventListener('click', (e) => {
        if (e.target === elements.cameraModal) {
            closeCamera();
        }
    });
}

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        showPreviewImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

function showPreviewImage(src) {
    currentImage = new Image();
    currentImage.onload = () => {
        elements.dropZoneContent.classList.add('hidden');
        elements.previewImage.src = src;
        elements.previewImage.classList.remove('hidden');
        elements.analyzeBtn.disabled = false;
        elements.resultsSection.classList.add('hidden');
        elements.prescriptionCard.classList.add('hidden');
        elements.healthBadge.classList.add('hidden');
    };
    currentImage.src = src;
}

async function openCamera() {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        elements.cameraVideo.srcObject = webcamStream;
        elements.cameraModal.classList.remove('hidden');
        
    } catch (error) {
        console.error('Camera error:', error);
        showError('Could not access camera. Please check permissions.');
    }
}

function capturePhoto() {
    const video = elements.cameraVideo;
    const canvas = elements.cameraCanvas;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    showPreviewImage(dataUrl);
    closeCamera();
}

function closeCamera() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    elements.cameraModal.classList.add('hidden');
}

function resetState() {
    currentImage = null;
    elements.previewImage.classList.add('hidden');
    elements.previewImage.src = '';
    elements.dropZoneContent.classList.remove('hidden');
    elements.analyzeBtn.disabled = true;
    elements.resultsSection.classList.add('hidden');
    elements.prescriptionCard.classList.add('hidden');
    elements.healthBadge.classList.add('hidden');
    elements.fileInput.value = '';
}

function parseClassName(className) {
    const parts = className.split('___');
    const plantName = parts[0].replace(/_/g, ' ').trim();
    const condition = parts[1] ? parts[1].replace(/_/g, ' ').trim().toLowerCase() : '';
    const isHealthy = condition === 'healthy';
    return { plantName, condition, isHealthy };
}

function buildDiseasePrompt(diseaseClass, confidence, plantName) {
    return `You are an expert plant pathologist and agricultural advisor.

A farmer has uploaded a leaf image. The AI model detected:
- Plant: ${plantName}
- Disease: ${diseaseClass}
- Confidence: ${confidence}%

Provide a structured treatment prescription with these exact sections:

🔬 DIAGNOSIS SUMMARY
One sentence explaining what this disease is and how it affects the plant.

⚠️ SEVERITY & URGENCY
Based on the confidence score, state urgency level (Low/Medium/High) and what happens if untreated.

💊 TREATMENT PLAN
List 3-5 specific actionable steps the farmer should take immediately. Include:
- Organic treatment option
- Chemical treatment option (with specific product type, not brand)
- Isolation/pruning advice if needed

🌱 RECOVERY CARE
2-3 steps to nurse the plant back to health after treatment.

⏱️ TIMELINE
Expected recovery time if treatment is followed correctly.

Keep language simple, practical, and farmer-friendly. Avoid jargon. Be concise — max 250 words total.`;
}

function buildHealthyPrompt(plantName) {
    return `You are an expert horticulturist and agricultural advisor.

A farmer has uploaded a leaf image. The AI model confirmed the plant is HEALTHY.
- Plant: ${plantName}

Provide a structured plant maintenance schedule with these exact sections:

✅ HEALTH STATUS
One positive sentence confirming the plant looks healthy and what that means for yield.

💧 WATERING SCHEDULE
Specific watering frequency and tips for this plant.

☀️ SUNLIGHT & TEMPERATURE
Ideal conditions to maintain current health.

🌿 FERTILIZATION
Recommended fertilization schedule and type (organic preferred).

🔍 PREVENTIVE CARE
3 early warning signs to watch for and how to prevent common diseases for this plant.

🗓️ MONTHLY CHECKLIST
A simple 4-week maintenance checklist the farmer can follow.

Keep language simple, practical, and farmer-friendly. Max 250 words total.`;
}

async function getGeminiPrescription(predictedClass, confidence, isHealthy, plantName) {
    const prompt = isHealthy
        ? buildHealthyPrompt(plantName)
        : buildDiseasePrompt(predictedClass, confidence, plantName);

    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 2048,
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('API response error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
    }
    
    throw new Error('Invalid response from API');
}

function renderPrescriptionMarkdown(text, isHealthy) {
    const headerColor = isHealthy ? 'var(--secondary)' : 'var(--tertiary)';
    const emojiPattern = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{1F600}-\u{1F64F}]|[✅⚠️🔬💊🌱⏱️💧☀️🌿🔍🗓️🩺💉🌡️🧪📋🚨])\s*(.+)/u;
    
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let listType = null;
    
    for (let line of lines) {
        line = line.trim();
        
        if (!line) {
            if (inList) {
                html += listType === 'ol' ? '</ol>' : '</ul>';
                inList = false;
                listType = null;
            }
            continue;
        }
        
        const emojiMatch = line.match(emojiPattern);
        
        if (emojiMatch) {
            if (inList) {
                html += listType === 'ol' ? '</ol>' : '</ul>';
                inList = false;
                listType = null;
            }
            html += `<h4 class="prescription-header" style="color: ${headerColor}">${line}</h4>`;
        } else if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
            if (!inList || listType !== 'ul') {
                if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
                html += '<ul class="prescription-list">';
                inList = true;
                listType = 'ul';
            }
            const itemText = line.replace(/^[-•*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html += `<li>${itemText}</li>`;
        } else if (line.match(/^\d+\.\s/)) {
            if (!inList || listType !== 'ol') {
                if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
                html += '<ol class="prescription-list">';
                inList = true;
                listType = 'ol';
            }
            const itemText = line.replace(/^\d+\.\s*/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html += `<li>${itemText}</li>`;
        } else {
            if (inList) {
                html += listType === 'ol' ? '</ol>' : '</ul>';
                inList = false;
                listType = null;
            }
            const processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html += `<p>${processed}</p>`;
        }
    }
    
    if (inList) {
        html += listType === 'ol' ? '</ol>' : '</ul>';
    }
    
    return html;
}

function showPrescriptionLoading(isHealthy) {
    const titleSpan = elements.prescriptionTitle.querySelector('span:last-child');
    if (titleSpan) {
        titleSpan.textContent = isHealthy ? 'Maintenance Schedule' : 'Treatment Prescription';
    }
    elements.prescriptionCard.className = `prescription-card ${isHealthy ? 'healthy' : 'disease'}`;
    elements.prescriptionContent.innerHTML = `
        <div class="skeleton-loader">
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
        </div>
    `;
    elements.prescriptionCard.classList.remove('hidden');
}

async function analyzeImage() {
    if (!session) {
        showError('Model is not loaded yet. Please wait.');
        return;
    }
    
    if (!currentImage) {
        showError('Please select an image first.');
        return;
    }
    
    elements.loadingState.classList.remove('hidden');
    elements.analyzeBtn.disabled = true;
    elements.prescriptionCard.classList.add('hidden');
    elements.healthBadge.classList.add('hidden');
    
    try {
        const inputTensor = preprocessImage(currentImage);
        
        const startTime = performance.now();
        const results = await session.run({ [session.inputNames[0]]: inputTensor });
        const inferenceTime = performance.now() - startTime;
        
        const output = results[session.outputNames[0]];
        const predictions = output.data;
        
        const processedResults = processResults(predictions);
        displayResults(processedResults, inferenceTime);
        
        console.log(`Inference completed in ${inferenceTime.toFixed(1)}ms`);
        
        const topPrediction = processedResults.top3[0];
        const parsed = parseClassName(topPrediction.rawName);
        const confidence = (topPrediction.probability * 100).toFixed(1);
        
        displayHealthBadge(parsed.isHealthy);
        showPrescriptionLoading(parsed.isHealthy);
        
        try {
            const prescription = await getGeminiPrescription(
                parsed.condition,
                confidence,
                parsed.isHealthy,
                parsed.plantName
            );
            
            elements.prescriptionContent.innerHTML = renderPrescriptionMarkdown(prescription, parsed.isHealthy);
            
        } catch (geminiError) {
            console.error('Gemini API error:', geminiError);
            const errorMsg = geminiError.message.includes('429') 
                ? 'API quota exceeded. Prescription service temporarily unavailable.'
                : 'Unable to fetch prescription. Please try again.';
            elements.prescriptionContent.innerHTML = `
                <p class="prescription-error">${errorMsg}</p>
            `;
        }
        
    } catch (error) {
        console.error('Analysis error:', error);
        showError('Failed to analyze image. Please try again.');
    } finally {
        elements.loadingState.classList.add('hidden');
        elements.analyzeBtn.disabled = false;
    }
}

function displayHealthBadge(isHealthy) {
    elements.healthBadge.className = `health-badge ${isHealthy ? 'healthy' : 'disease'}`;
    elements.healthBadge.innerHTML = `
        <span class="material-symbols-outlined">${isHealthy ? 'check_circle' : 'error'}</span>
        <span>${isHealthy ? 'Healthy Plant' : 'Disease Detected'}</span>
    `;
    elements.healthBadge.classList.remove('hidden');
}

function preprocessImage(img) {
    const canvas = document.createElement('canvas');
    canvas.width = IMG_SIZE;
    canvas.height = IMG_SIZE;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
    
    const imageData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE);
    const pixels = imageData.data;
    
    const float32Data = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
    
    for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
        float32Data[i] = pixels[i * 4] / 255.0;
        float32Data[IMG_SIZE * IMG_SIZE + i] = pixels[i * 4 + 1] / 255.0;
        float32Data[2 * IMG_SIZE * IMG_SIZE + i] = pixels[i * 4 + 2] / 255.0;
    }
    
    return new ort.Tensor('float32', float32Data, [1, 3, IMG_SIZE, IMG_SIZE]);
}

function softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(x => Math.exp(x - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(x => x / sumExps);
}

function processResults(predictions) {
    const logits = Array.from(predictions);
    const probs = softmax(logits);
    
    const indexed = probs.map((prob, idx) => ({ index: idx, probability: prob }));
    indexed.sort((a, b) => b.probability - a.probability);
    const top3 = indexed.slice(0, 3);
    
    const classNames = typeof CLASS_NAMES !== 'undefined' ? CLASS_NAMES : null;
    
    return {
        top3: top3.map(item => ({
            index: item.index,
            name: classNames ? formatClassName(classNames[item.index]) : `Class ${item.index}`,
            rawName: classNames ? classNames[item.index] : `Class ${item.index}`,
            probability: item.probability,
            isHealthy: classNames ? classNames[item.index].toLowerCase().includes('healthy') : false
        }))
    };
}

function formatClassName(name) {
    return name
        .replace(/___/g, ' - ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
        .replace(/\(/g, '(')
        .replace(/\)/g, ')');
}

function displayResults(results, inferenceTime) {
    const { top3 } = results;
    
    elements.resultsList.innerHTML = '';
    
    top3.forEach((pred, idx) => {
        const item = document.createElement('div');
        const confidence = (pred.probability * 100).toFixed(1);
        
        let itemClass = 'result-item';
        if (pred.isHealthy) {
            itemClass += ' healthy';
        } else if (pred.rawName && !pred.rawName.toLowerCase().includes('healthy')) {
            itemClass += ' disease';
        }
        
        item.className = itemClass;
        
        item.innerHTML = `
            <div class="result-label">
                <span class="result-name">${pred.name}</span>
                <span class="result-confidence">${confidence}%</span>
            </div>
            <div class="result-bar">
                <div class="result-bar-fill" style="width: ${confidence}%"></div>
            </div>
        `;
        
        elements.resultsList.appendChild(item);
    });
    
    elements.resultsSection.classList.remove('hidden');
    
    setTimeout(() => {
        elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function showError(message) {
    let toast = document.querySelector('.error-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'error-toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 5000);
}

document.addEventListener('DOMContentLoaded', init);
