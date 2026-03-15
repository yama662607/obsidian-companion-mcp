type IndexJob = {
  path: string;
  content: string;
  updatedAt: number;
};

export class IndexingQueue {
  private queue: IndexJob[] = [];
  private running = false;

  enqueue(job: IndexJob): void {
    const existing = this.queue.find((item) => item.path === job.path);
    if (existing && existing.updatedAt >= job.updatedAt) {
      return;
    }
    this.queue.push(job);
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
