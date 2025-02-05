class AgentVisualization {
    constructor(taskType) {
        this.taskType = taskType; // 'maze' or 'memory'
        this.currentRun = 0;
        this.currentFrame = 0;
        this.runs = [];
        this.maxFrames = 0;
        this.imageCache = new Map();
        this.preloadRadius = 20;
        this.loadingPromise = null;  // Add this line
        this.loadedRuns = new Set();  // Add this line
        this.isLoadingRuns = false;   // Add this line
        this.loadingQueue = [];
        this.isProcessingQueue = false;
        this.loadingStrategy = 'sparse'; // 'sparse' or 'fill'

        // Get DOM elements with task-specific IDs
        this.mainFrame = document.getElementById(`mainFrame_${taskType}`);
        this.memoryHeatmap = document.getElementById(`memoryHeatmap_${taskType}`);
        this.frameSlider = document.getElementById(`frameSlider_${taskType}`);
        this.frameNumber = document.getElementById(`frameNumber_${taskType}`);
        this.maxFrame = document.getElementById(`maxFrame_${taskType}`);
        this.runInfo = document.getElementById(`runInfo_${taskType}`);

        this.setupEventListeners();
        this.loadRuns();
    }

    async loadRuns() {
        const response = await fetch(`/static/runs/${this.taskType}/runs.json`);
        this.runs = await response.json();
        if (this.runs.length > 0) {
            // First load sparse frames for all runs
            await this.initializeSparseLoading();
            // Then load current run completely
            await this.loadRunCompletely(this.currentRun);
            this.updateVisualization();
            // Start background loading
            this.startBackgroundLoading();
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
        const mainUrl = `/static/runs/${this.taskType}/${run.id}/images/env_${paddedFrame}.png`;
        const memoryUrl = `/static/runs/${this.taskType}/${run.id}/images/memory_${paddedFrame}.png`;

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
            const mainUrl = `/static/runs/${this.taskType}/${run.id}/images/env_${paddedFrame}.png`;
            
            if (!this.imageCache.has(mainUrl)) {
                await this.loadSingleFrame(runIndex, frame);
            }
        }
    }

    setupEventListeners() {
        document.getElementById(`prevRun_${this.taskType}`).addEventListener('click', () => this.changeRun(-1));
        document.getElementById(`nextRun_${this.taskType}`).addEventListener('click', () => this.changeRun(1));
        this.frameSlider.addEventListener('input', (e) => {
            this.currentFrame = parseInt(e.target.value);
            this.updateVisualization();  // Remove throttling, update immediately
        });

        // Remove the 'change' event listener since we update immediately on 'input'
    }

    async changeRun(delta) {
        const newRun = (this.currentRun + delta + this.runs.length) % this.runs.length;
        this.currentRun = newRun;
        this.currentFrame = 0;
        
        // Ensure we have at least sparse frames loaded
        if (!this.loadedRuns.has(newRun)) {
            await this.loadSingleFrame(newRun, 0);
        }
        
        this.updateVisualization();
        
        // Priority load the new current run
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
        
        const mainUrl = `/static/runs/${this.taskType}/${run.id}/images/env_${paddedFrame}.png`;
        const memoryUrl = `/static/runs/${this.taskType}/${run.id}/images/memory_${paddedFrame}.png`;
        
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
            const fallbackMainUrl = `/static/runs/${this.taskType}/${run.id}/images/env_${paddedNearestFrame}.png`;
            const fallbackMemoryUrl = `/static/runs/${this.taskType}/${run.id}/images/memory_${paddedNearestFrame}.png`;
            
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
                const url = `/static/runs/${this.taskType}/${runId}/images/env_${paddedFrame}.png`;
                
                if (this.imageCache.has(url)) {
                    return frame;
                }
            }
            step++;
        }
        return 0; // Fallback to first frame if nothing found
    }
}
