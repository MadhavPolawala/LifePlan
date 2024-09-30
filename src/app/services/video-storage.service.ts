import { Injectable } from '@angular/core';
import { openDB } from 'idb';

@Injectable({
  providedIn: 'root',
})
export class VideoStorageService {
  private dbPromise = openDB('video-store', 1, {
    upgrade(db) {
      db.createObjectStore('videos', { keyPath: 'id' });
    },
  });

  async addVideo(id: string, videoBlob: Blob): Promise<void> {
    const db = await this.dbPromise;
    await db.put('videos', { id, videoBlob });
  }

  async getVideo(id: string): Promise<Blob | undefined> {
    const db = await this.dbPromise;
    const video = await db.get('videos', id);
    return video ? video.videoBlob : undefined;
  }

  async getAllVideos(): Promise<{ id: string; videoBlob: Blob }[]> {
    const db = await this.dbPromise;
    const videos = await db.getAll('videos');
    return videos;
  }

  async deleteVideo(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('videos', id);
  }
}
