type IndexJob = {
  path: string;
  content: string;
  updatedAt: number;
};

export class IndexingQueue {
  private queue: IndexJob[] = [];
  private running = false;

  getPendingCount(): number {
    return this.queue.length;
  }

  isRunning(): boolean {
    return this.running;
  }

  getPendingSample(limit: number): string[] {
    return this.queue.slice(0, Math.max(limit, 0)).map((job) => job.path);
  }

  enqueue(job: IndexJob): boolean {
    const existingIndex = this.queue.findIndex((item) => item.path === job.path);
    if (existingIndex !== -1) {
      if (this.queue[existingIndex].updatedAt >= job.updatedAt) {
        return false;
      }
      this.queue.splice(existingIndex, 1);
    }

    this.queue.push(job);
    return true;
  }

  renamePath(from: string, to: string): void {
    const existingIndex = this.queue.findIndex((item) => item.path === from);
    if (existingIndex === -1) {
      return;
    }

    this.queue[existingIndex] = {
      ...this.queue[existingIndex],
      path: to,
    };
  }

  removePath(path: string): void {
    const existingIndex = this.queue.findIndex((item) => item.path === path);
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }
  }

  async process(handler: (job: IndexJob) => Promise<void>, maxItems = 25): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;

    let processed = 0;
    try {
      while (this.queue.length > 0 && processed < maxItems) {
        const job = this.queue.shift();
        if (!job) {
          break;
        }
        await handler(job);
        processed += 1;
      }
      return processed;
    } finally {
      this.running = false;
    }
  }
}
