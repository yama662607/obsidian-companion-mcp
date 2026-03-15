type IndexedNote = {
  path: string;
  snippet: string;
  updatedAt: number;
};

export class SemanticService {
  private notes = new Map<string, IndexedNote>();

  upsert(path: string, snippet: string, updatedAt: number): void {
    this.notes.set(path, { path, snippet, updatedAt });
  }

  search(query: string, limit: number): Array<{ path: string; score: number; snippet: string }> {
    const q = query.toLowerCase();
    return Array.from(this.notes.values())
      .map((note) => ({
        path: note.path,
        snippet: note.snippet,
        score: note.snippet.toLowerCase().includes(q) ? 0.9 : 0.2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
