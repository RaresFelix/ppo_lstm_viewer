class AgentVisualization {
    constructor(taskType) {
        this.taskType = taskType; // 'maze' or 'memory'
        this.currentRun = 0;
        this.currentFrame = 0;
        this.runs = [];
        this.maxFrames = 0;
        this.imageCache = new Map();
        this.preloadRadius = 20;
        this.loadingPromise = null;
        this.loadedRuns = new Set();
        this.isLoadingRuns = false;
        this.loadingQueue = [];
        this.isProcessingQueue = false;
        this.loadingStrategy = 'sparse'; // 'sparse' or 'fill'
        this.isLoading = true;  // Initially we're loading
        
        // Determine base path - handle both local testing and GitHub Pages deployment
        this.basePath = this.determineBasePath();

        // Get DOM elements with task-specific IDs
        this.mainFrame = document.getElementById(`mainFrame_${taskType}`);
        this.memoryHeatmap = document.getElementById(`memoryHeatmap_${taskType}`);
        this.frameSlider = document.getElementById(`frameSlider_${taskType}`);
        this.frameNumber = document.getElementById(`frameNumber_${taskType}`);
        this.maxFrame = document.getElementById(`maxFrame_${taskType}`);
        this.runInfo = document.getElementById(`runInfo_${taskType}`);
        
        // Create loading indicator
        this.createLoadingIndicator();

        this.setupEventListeners();
        this.loadRuns();
    }
    
    createLoadingIndicator() {
        // Create loading containers for both main frame and memory heatmap
        const mainFrameContainer = this.mainFrame.parentElement;
        const memoryHeatmapContainer = this.memoryHeatmap.parentElement;
        
        // Create loading overlays
        this.mainLoadingOverlay = document.createElement('div');
        this.mainLoadingOverlay.className = 'absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10';
        this.mainLoadingOverlay.innerHTML = '<div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-[#da7756] border-r-transparent"></div>';
        
        this.memoryLoadingOverlay = document.createElement('div');
        this.memoryLoadingOverlay.className = 'absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10';
        this.memoryLoadingOverlay.innerHTML = '<div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-[#da7756] border-r-transparent"></div>';
        
        // Insert loading overlays
        mainFrameContainer.style.position = 'relative';
        memoryHeatmapContainer.style.position = 'relative';
        mainFrameContainer.appendChild(this.mainLoadingOverlay);
        memoryHeatmapContainer.appendChild(this.memoryLoadingOverlay);
    }
    
    determineBasePath() {
        // Check if we're on GitHub Pages (contains repository name in path)
        const path = window.location.pathname;
        if (path.includes('/ppo_lstm_viewer/')) {
            return '/ppo_lstm_viewer';
        } else {
            return '';
        }
    }

    showLoading() {
        if (this.mainLoadingOverlay) {
            this.mainLoadingOverlay.style.display = 'flex';
        }
        if (this.memoryLoadingOverlay) {
            this.memoryLoadingOverlay.style.display = 'flex';
        }
        this.isLoading = true;
    }
    
    hideLoading() {
        if (this.mainLoadingOverlay) {
            this.mainLoadingOverlay.style.display = 'none';
        }
        if (this.memoryLoadingOverlay) {
            this.memoryLoadingOverlay.style.display = 'none';
        }
        this.isLoading = false;
    }

    async loadRuns() {
        this.showLoading();
        try {
            const response = await fetch(`${this.basePath}/static/runs/${this.taskType}/runs.json`);
            this.runs = await response.json();
            if (this.runs.length > 0) {
                // First load sparse frames for all runs
                await this.initializeSparseLoading();
                // Then load current run completely
                await this.loadRunCompletely(this.currentRun);
                this.updateVisualization();
                this.hideLoading();
                // Start background loading
                this.startBackgroundLoading();
            } else {
                this.hideLoading();
            }
        } catch (error) {
            console.error(`Error loading runs for ${this.taskType}:`, error);
            this.hideLoading();
        }
    }

    async initializeSparseLoading() {
        for (let runIndex = 0; runIndex < this.runs.length; runIndex++) {
            const run = this.runs[runIndex];
            const totalFrames = run.frame_count;
            // Load every 10th frame initially
            for (let frame = 0; frame < totalFrames; frame += 10) {
                await this.loadSingleFrame(runIndex, frame);
            }
        }
    }

    async loadRunCompletely(runIndex) {
        const run = this.runs[runIndex];
        const totalFrames = run.frame_count;
        for (let frame = 0; frame < totalFrames; frame++) {
            await this.loadSingleFrame(runIndex, frame);
        }
        this.loadedRuns.add(runIndex);
    }

    async loadSingleFrame(runIndex, frame) {
        const run = this.runs[runIndex];
        const paddedFrame = String(frame).padStart(4, '0');
        const mainUrl = `${this.basePath}/static/runs/${this.taskType}/${run.id}/images/env_${paddedFrame}.png`;
        const memoryUrl = `${this.basePath}/static/runs/${this.taskType}/${run.id}/images/memory_${paddedFrame}.png`;

        const promises = [];
        for (const url of [mainUrl, memoryUrl]) {
            if (!this.imageCache.has(url)) {
                promises.push(this.loadImage(url));
            }
        }
        await Promise.all(promises);
    }

    loadImage(url) {
        if (this.imageCache.has(url)) {
            return Promise.resolve(this.imageCache.get(url));
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.imageCache.set(url, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    startBackgroundLoading() {
        if (!this.isProcessingQueue) {
            this.isProcessingQueue = true;
            this.processLoadingQueue();
        }
    }

    async processLoadingQueue() {
        while (true) {
            // First, fill gaps in current run
            await this.fillGapsInRun(this.currentRun);
            
            // Then load other runs completely
            for (let i = 0; i < this.runs.length; i++) {
                if (i !== this.currentRun && !this.loadedRuns.has(i)) {
                    await this.loadRunCompletely(i);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 100)); // Prevent CPU hogging
        }
    }

    async fillGapsInRun(runIndex) {
        const run = this.runs[runIndex];
        const totalFrames = run.frame_count;
        
        for (let frame = 0; frame < totalFrames; frame++) {
            const paddedFrame = String(frame).padStart(4, '0');
            const mainUrl = `/ppo_lstm_viewer/static/runs/${this.taskType}/${run.id}/images/env_${paddedFrame}.png`;
            
            if (!this.imageCache.has(mainUrl)) {
                await this.loadSingleFrame(runIndex, frame);
            }
        }
    }

    setupEventListeners() {
        // Navigation between runs
        document.getElementById(`prevRun_${this.taskType}`).addEventListener('click', () => this.changeRun(-1));
        document.getElementById(`nextRun_${this.taskType}`).addEventListener('click', () => this.changeRun(1));
        
        // Frame slider
        this.frameSlider.addEventListener('input', (e) => {
            this.currentFrame = parseInt(e.target.value);
            this.updateVisualization();
        });
        
        // Playback controls
        this.isPlaying = false;
        this.playbackInterval = null;
        this.playbackSpeed = 5; // frames per second
        
        // First frame button
        document.getElementById(`firstFrame_${this.taskType}`).addEventListener('click', () => {
            this.stopPlayback();
            this.currentFrame = 0;
            this.updateVisualization();
        });
        
        // Previous frame button
        document.getElementById(`prevFrame_${this.taskType}`).addEventListener('click', () => {
            this.stopPlayback();
            if (this.currentFrame > 0) {
                this.currentFrame--;
                this.updateVisualization();
            }
        });
        
        // Play/Pause button
        document.getElementById(`playPause_${this.taskType}`).addEventListener('click', () => {
            if (this.isPlaying) {
                this.stopPlayback();
            } else {
                this.startPlayback();
            }
        });
        
        // Next frame button
        document.getElementById(`nextFrame_${this.taskType}`).addEventListener('click', () => {
            this.stopPlayback();
            if (this.currentFrame < this.maxFrames) {
                this.currentFrame++;
                this.updateVisualization();
            }
        });
        
        // Last frame button
        document.getElementById(`lastFrame_${this.taskType}`).addEventListener('click', () => {
            this.stopPlayback();
            this.currentFrame = this.maxFrames;
            this.updateVisualization();
        });
        
        // Speed control
        document.getElementById(`speed_${this.taskType}`).addEventListener('change', (e) => {
            this.playbackSpeed = parseInt(e.target.value);
            if (this.isPlaying) {
                // Restart playback with new speed
                this.stopPlayback();
                this.startPlayback();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only respond if we're the active visualization
            if (document.activeElement && document.activeElement.id && 
                document.activeElement.id.includes(this.taskType)) {
                
                switch(e.key) {
                    case ' ': // Space
                        if (this.isPlaying) {
                            this.stopPlayback();
                        } else {
                            this.startPlayback();
                        }
                        break;
                    case 'ArrowLeft':
                        this.stopPlayback();
                        if (this.currentFrame > 0) {
                            this.currentFrame--;
                            this.updateVisualization();
                        }
                        break;
                    case 'ArrowRight':
                        this.stopPlayback();
                        if (this.currentFrame < this.maxFrames) {
                            this.currentFrame++;
                            this.updateVisualization();
                        }
                        break;
                    case 'Home':
                        this.stopPlayback();
                        this.currentFrame = 0;
                        this.updateVisualization();
                        break;
                    case 'End':
                        this.stopPlayback();
                        this.currentFrame = this.maxFrames;
                        this.updateVisualization();
                        break;
                }
            }
        });
    }
    
    startPlayback() {
        if (this.isPlaying) return;
        
        const playIcon = document.getElementById(`playIcon_${this.taskType}`);
        const pauseIcon = document.getElementById(`pauseIcon_${this.taskType}`);
        const speedSelect = document.getElementById(`speed_${this.taskType}`);
        
        // Update playback speed from select
        if (speedSelect) {
            this.playbackSpeed = parseInt(speedSelect.value);
        }
        
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'inline';
        
        this.isPlaying = true;
        this.playbackInterval = setInterval(() => {
            if (this.currentFrame < this.maxFrames) {
                this.currentFrame++;
                this.updateVisualization();
            } else {
                this.stopPlayback();
            }
        }, 1000 / this.playbackSpeed);
    }
    
    stopPlayback() {
        if (!this.isPlaying) return;
        
        const playIcon = document.getElementById(`playIcon_${this.taskType}`);
        const pauseIcon = document.getElementById(`pauseIcon_${this.taskType}`);
        
        playIcon.style.display = 'inline';
        pauseIcon.style.display = 'none';
        
        this.isPlaying = false;
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
    }

    async changeRun(delta) {
        this.showLoading();
        const newRun = (this.currentRun + delta + this.runs.length) % this.runs.length;
        this.currentRun = newRun;
        this.currentFrame = 0;
        
        // Ensure we have at least sparse frames loaded
        if (!this.loadedRuns.has(newRun)) {
            await this.loadSingleFrame(newRun, 0);
        }
        
        this.updateVisualization();
        this.hideLoading();
        
        // Priority load the new current run in the background
        this.loadRunCompletely(newRun).then(() => {
            this.startBackgroundLoading();
        });
    }

    updateVisualization() {
        if (this.runs.length === 0) return;

        const run = this.runs[this.currentRun];
        this.maxFrames = run.frame_count - 1;
        this.frameSlider.max = this.maxFrames;
        this.frameSlider.value = this.currentFrame;
        
        const paddedFrame = String(this.currentFrame).padStart(4, '0');
        
        const mainUrl = `${this.basePath}/static/runs/${this.taskType}/${run.id}/images/env_${paddedFrame}.png`;
        const memoryUrl = `${this.basePath}/static/runs/${this.taskType}/${run.id}/images/memory_${paddedFrame}.png`;
        
        // Use cached images
        if (this.imageCache.has(mainUrl)) {
            this.mainFrame.src = this.imageCache.get(mainUrl).src;
        }
        if (this.imageCache.has(memoryUrl)) {
            this.memoryHeatmap.src = this.imageCache.get(memoryUrl).src;
        }
        
        // Add fallback for missing frames
        if (!this.imageCache.has(mainUrl)) {
            // Find nearest loaded frame
            const frame = this.findNearestLoadedFrame(run.id, this.currentFrame);
            const paddedNearestFrame = String(frame).padStart(4, '0');
            const fallbackMainUrl = `${this.basePath}/static/runs/${this.taskType}/${run.id}/images/env_${paddedNearestFrame}.png`;
            const fallbackMemoryUrl = `${this.basePath}/static/runs/${this.taskType}/${run.id}/images/memory_${paddedNearestFrame}.png`;
            
            if (this.imageCache.has(fallbackMainUrl)) {
                this.mainFrame.src = this.imageCache.get(fallbackMainUrl).src;
            }
            if (this.imageCache.has(fallbackMemoryUrl)) {
                this.memoryHeatmap.src = this.imageCache.get(fallbackMemoryUrl).src;
            }
        } else {
            this.mainFrame.src = this.imageCache.get(mainUrl).src;
            this.memoryHeatmap.src = this.imageCache.get(memoryUrl).src;
        }

        this.frameNumber.textContent = this.currentFrame;
        this.maxFrame.textContent = this.maxFrames;
        this.runInfo.textContent = `Run ${this.currentRun + 1} of ${this.runs.length}`;
    }

    findNearestLoadedFrame(runId, targetFrame) {
        let step = 1;
        while (step < 20) {
            // Check frames before and after the target
            for (let offset of [0, -step, step]) {
                const frame = targetFrame + offset;
                if (frame < 0) continue;
                
                const paddedFrame = String(frame).padStart(4, '0');
                const url = `${this.basePath}/static/runs/${this.taskType}/${runId}/images/env_${paddedFrame}.png`;
                
                if (this.imageCache.has(url)) {
                    return frame;
                }
            }
            step++;
        }
        return 0; // Fallback to first frame if nothing found
    }
}
