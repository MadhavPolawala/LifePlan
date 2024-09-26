import { Injectable } from '@angular/core';
import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root',
})
export class AudioStorageService {
  generateId(): string {
    return uuidv4();
  }
  private dbPromise = openDB('audio-store', 1, {
    upgrade(db) {
      db.createObjectStore('audios', { keyPath: 'id' });
    },
  });

  async addAudio(id: string, audioBlob: Blob): Promise<void> {
    const db = await this.dbPromise;
    await db.put('audios', { id, audioBlob });
  }

  async getAudio(id: string): Promise<Blob | undefined> {
    const db = await this.dbPromise;
    const audio = await db.get('audios', id);
    return audio ? audio.audioBlob : undefined;
  }

  async getAllAudios(): Promise<{ id: string; audioBlob: Blob }[]> {
    const db = await this.dbPromise;
    const audios = await db.getAll('audios');
    return audios;
  }

  async deleteAudio(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('audios', id);
  }
}
