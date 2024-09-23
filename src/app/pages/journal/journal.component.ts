import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { openDB } from 'idb';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [HttpClientModule, CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.css',
})
export class JournalComponent implements OnInit {
  currentAudioState: 'initialAudio' | 'recordingAudio' | 'recordedAudio' =
    'initialAudio';
  isPaused = false;
  isPlaying = false;
  recordingTime = 0;
  maxRecordingTime = 60; // 1 minute max recording
  recordedAudio: Blob | null = null;
  recordedDuration = 0;
  playbackTime = 0;
  recorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  audioUrl: string | null = null;
  audioPlayer: HTMLAudioElement | null = null;

  jsonData: any;
  navbarJson: any;
  sharedJson: any;
  privateJson: any;
  currentDate = new Date().toLocaleDateString('en-US');
  currentDateTime = new Date().toLocaleString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    day: 'numeric',
    year: 'numeric',
    month: 'long',
  });
  journalModal: boolean = false;
  tags: string[] = [];
  fileNames: string[] = [];
  dbFiles: any;

  journalForm = new FormGroup({
    title: new FormControl('', [Validators.required]),
    description: new FormControl('', [Validators.required]),
    tagEnter: new FormControl([], [Validators.required]),
  });

  constructor(private http: HttpClient) {
    this.initIndexedDB();
  }

  ngOnInit(): void {
    this.http.get('/assets/data/slidebar.json').subscribe((data) => {
      this.jsonData = data;
      this.navbarJson = this.jsonData.navbar;
      this.sharedJson = this.jsonData.shared;
      this.privateJson = this.jsonData.private;
    });
  }

  get title() {
    return this.journalForm.get('title');
  }

  get description() {
    return this.journalForm.get('description');
  }

  get tagEnter() {
    return this.journalForm.get('tagEnter');
  }

  journalFormSubmit() {
    console.log(this.journalForm.value);
  }

  openJournalModal() {
    this.journalModal = !this.journalModal;
  }

  openSearch() {
    const journalSearch1 = document.getElementById('journalSearch1');
    const journalSearch2 = document.getElementById('journalSearch2');
    const searchInput = journalSearch2?.querySelector('input'); // Assuming the input field is inside journalSearch2

    if (!journalSearch1 || !journalSearch2 || !searchInput) return; // If any element is missing, stop execution

    // Step 1: Animate journalSearch1 out (right to left)
    journalSearch1.classList.add('-translate-x-full', 'opacity-0');
    journalSearch1.classList.remove('translate-x-0', 'opacity-100');

    // Step 2: After journalSearch1 finishes, show journalSearch2 (left to right)
    setTimeout(() => {
      journalSearch1.classList.add('hidden'); // Completely hide journalSearch1

      // Show journalSearch2
      journalSearch2.classList.remove('hidden'); // Make journalSearch2 visible
      journalSearch2.classList.remove('-translate-x-full', 'opacity-0'); // Slide in from the left
      journalSearch2.classList.add('translate-x-0', 'opacity-100'); // Ensure it's fully visible

      // Focus the input field once it's visible
      searchInput.focus();
    }, 300); // Delay for journalSearch1's transition (300ms)
  }

  closeSearch() {
    const journalSearch1 = document.getElementById('journalSearch1');
    const journalSearch2 = document.getElementById('journalSearch2');

    if (!journalSearch1 || !journalSearch2) return; // If either element is missing, stop execution

    // Animate journalSearch2 out (to the right)
    journalSearch2.classList.add('-translate-x-full', 'opacity-0');
    journalSearch2.classList.remove('translate-x-0', 'opacity-100');

    // Wait for journalSearch2 to finish transitioning (300ms), then show journalSearch1
    setTimeout(() => {
      // Hide journalSearch2 completely after the animation
      journalSearch2.classList.add('hidden');

      // Reveal journalSearch1
      journalSearch1.classList.remove('hidden');
      journalSearch1.classList.remove('translate-x-full', 'opacity-0');
      journalSearch1.classList.add('translate-x-0', 'opacity-100');
    }, 300); // Adjust the delay based on your transition duration (300ms in this case)
  }
  createJournal() {
    const journalStart = document.getElementById('journalStart');
    const journalModal = document.getElementById('journalModal');
    const journalModalInput = document.getElementById('journalModalInput');

    journalStart?.classList.add('hidden');
    journalModal?.classList.add('hidden');
    journalModalInput?.classList.remove('hidden');
  }

  onAudioResume() {
    // const recordingPauseIcon = document.getElementById('recordingPauseIcon');
    // const recordingResumeIcon = document.getElementById('recordingResumeIcon');

    // recordingPauseIcon?.classList.remove('hidden');
    // recordingResumeIcon?.classList.add('hidden');

    this.isPaused = false;
    this.recorder?.resume();
  }

  onAudioStop() {
    const recordingPauseIcon = document.getElementById('recordingPauseIcon');
    const recordingStartIcon = document.getElementById('recordingStartIcon');
    const recordingResumeIcon = document.getElementById('recordingResumeIcon');

    recordingPauseIcon?.classList.add('hidden');
    recordingStartIcon?.classList.remove('hidden');
    recordingResumeIcon?.classList.add('hidden');

    this.recorder?.stop();
    this.recorder!.onstop = async () => {
      this.recordedAudio = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioUrl = URL.createObjectURL(this.recordedAudio);
      this.recordedDuration = this.recordingTime;

      await this.saveToIndexedDB(this.recordedAudio);
      this.currentAudioState = 'recordedAudio';
    };
  }

  async startRecordingAudio() {
    this.currentAudioState = 'recordingAudio';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recorder = new MediaRecorder(stream);
    this.audioChunks = [];
    this.recorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };
    this.recorder.start();
    this.isPaused = false;
    this.startRecordingTimer();
    // try {
    //   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    //   this.recorder = new MediaRecorder(stream);

    //   // Additional setup...
    //   this.recorder.start();

    //   // Start recording timer
    //   this.startRecordingTimer();

    //   this.currentAudioState = 'recordingAudio'; // Update state
    // } catch (error) {
    //   console.error('Error accessing microphone:', error);
    //   alert('Please check your microphone settings and permissions.');
    // }
  }

  startRecordingTimer() {
    const interval = setInterval(() => {
      if (this.isPaused || this.currentAudioState !== 'recordingAudio') {
        clearInterval(interval);
        return;
      }

      this.recordingTime++;
      if (this.recordingTime >= this.maxRecordingTime) {
        this.onAudioStop();
        clearInterval(interval);
      }
    }, 1000);
  }

  startPlaybackTimer() {
    const interval = setInterval(() => {
      if (!this.isPlaying || this.currentAudioState !== 'recordedAudio') {
        clearInterval(interval);
        return;
      }

      this.playbackTime++;
      if (this.playbackTime >= this.recordedDuration) {
        this.isPlaying = false;
        clearInterval(interval);
      }
    }, 1000);
  }

  onRecordedPlay() {
    // const recordedPlayIcon = document.getElementById('recordedPlayIcon');
    // const recordedPauseIcon = document.getElementById('recordedPauseIcon');
    // recordedPlayIcon?.classList.add('hidden');
    // recordedPauseIcon?.classList.remove('hidden');
    if (!this.audioUrl) return;

    this.audioPlayer = new Audio(this.audioUrl);
    this.isPlaying = true;

    this.audioPlayer.play();
    this.startPlaybackTimer();

    this.audioPlayer.onended = () => {
      this.isPlaying = false;
      this.playbackTime = 0;
    };
  }

  onRecordedPause() {
    this.audioPlayer?.pause();
    this.isPlaying = false;
  }

  onAudioPause() {
    // const recordingPauseIcon = document.getElementById('recordingPauseIcon');
    // const recordingResumeIcon = document.getElementById('recordingResumeIcon');

    // recordingPauseIcon?.classList.add('hidden');
    // recordingResumeIcon?.classList.remove('hidden');
    this.recorder?.pause();
    this.isPaused = true;
  }
  async saveToIndexedDB(audioBlob: Blob) {
    const dbFiles = await openDB('voiceRecorderDB', 1, {
      upgrade(dbFiles) {
        if (!dbFiles.objectStoreNames.contains('audioRecordings')) {
          dbFiles.createObjectStore('audioRecordings', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });

    await dbFiles.add('audioRecordings', {
      audio: audioBlob,
      date: new Date(),
    });
  }
  addTag(): void {
    const tagInput = document.getElementById('tagInput') as HTMLInputElement;
    const tag = tagInput.value.trim();

    if (tag !== '') {
      this.tags.push(tag);
    }

    // Clear input after tag is added
    tagInput.value = '';
  }
  removeTag(index: number): void {
    this.tags.splice(index, 1);
  }

  async initIndexedDB() {
    // Create a new IndexedDB instance
    this.dbFiles = await openDB('fileStorageDB', 1, {
      upgrade(dbFiles) {
        if (!dbFiles.objectStoreNames.contains('files')) {
          dbFiles.createObjectStore('files', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files) {
      // Convert FileList to an array before mapping or iterating
      this.fileNames = Array.from(files).map((file) => file.name);

      // Loop over the files using Array.from() to convert FileList to an iterable array
      for (const file of Array.from(files)) {
        const fileData = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: await this.convertFileToBase64(file), // convert file to Base64
        };

        // Store the file in IndexedDB
        await this.storeFileInIndexedDB(fileData);
      }
    }
  }

  // Convert file to Base64 for storage
  convertFileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  // Store file in IndexedDB
  async storeFileInIndexedDB(fileData: any) {
    const tx = this.dbFiles.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    await store.add(fileData);
    await tx.done;
  }
}
