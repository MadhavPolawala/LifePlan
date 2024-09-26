import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  FormControl,
  FormGroup,
  Validators,
  FormBuilder,
  FormArray,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { openDB } from 'idb';
import {
  CdkDragDrop,
  moveItemInArray,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { EditorModule } from '@tinymce/tinymce-angular';
import { from, Observable } from 'rxjs';
import { FileSizePipe } from '../../file-size.pipe';
import { VideoStorageService } from '../../services/video-storage.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { v4 as uuidv4 } from 'uuid';
import { ActivatedRoute } from '@angular/router';
import { AudioStorageService } from '../../services/audio-storage.service';

interface FileUpload {
  fileUrl: any;
  file: File;
  progress: number;
  isUploading: boolean;
}

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [
    HttpClientModule,
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    DragDropModule,
    EditorModule,
    FileSizePipe,
  ],
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
  hasInteractedTags: boolean = false;
  audioSrc: string | null = null;
  private recordedChunksAudio: Blob[] = [];

  // video

  private mediaRecorderVideo!: MediaRecorder;
  private recordedChunks: Blob[] = [];
  isRecording = false;
  videoSrc: string | null = null;
  allVideos: { id: string; videoBlob: Blob }[] = [];
  showDeleteConfirmation = false; // Flag to control the modal visibility
  videoToDelete: string | null = null;

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

  files: Array<{
    file: File;
    fileUrl: string;
    progress: number;
    isUploading: boolean;
  }> = [];
  storedFiles: Array<{
    name: string;
    type: string;
    content: string | ArrayBuffer | null;
  }> = [];
  uploadProgress: number[] = [];

  journalEntries: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    audio: any;
  }[] = [];
  selectedJournalEntry: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    audio: any;
  } | null = null;
  selectedEntry: any;

  sanitizedDescription: SafeHtml | null = null;

  onSelectJournalEntry(entry: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    audio: any;
  }) {
    this.selectedJournalEntry = entry;
  }

  journalForm = new FormGroup({
    title: new FormControl('', [Validators.required]),
    description: new FormControl('', [Validators.required]),
    tagEnter: new FormArray([], [this.minimumOneTagValidator()]), //all tags will be stored in this array
  });

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private videoStorageService: VideoStorageService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private audioStorageService: AudioStorageService
  ) {
    this.initIndexedDB();
    this.initIndexedDBFile();
  }

  ngOnInit(): void {
    this.http.get('/assets/data/slidebar.json').subscribe((data) => {
      this.jsonData = data;
      this.navbarJson = this.jsonData.navbar;
      this.sharedJson = this.jsonData.shared;
      this.privateJson = this.jsonData.private;
    });

    this.loadJournalEntries();
    this.loadStoredFiles();
    this.initIndexedDBFile();
    this.loadTagsFromLocalStorage();
    this.loadAllVideos();
    this.sanitizedDescription = this.sanitizer.bypassSecurityTrustHtml(
      this.selectedJournalEntry?.description || ''
    );
    const savedOrder = localStorage.getItem('journalOrder');
    if (savedOrder) {
      this.journalEntries = JSON.parse(savedOrder);
    }
  }

  preventSubmit(event: Event) {
    event.preventDefault();
  }

  get title() {
    return this.journalForm.get('title');
  }

  get description() {
    return this.journalForm.get('description');
  }

  get tagEnter() {
    return this.journalForm.get('tagEnter') as FormArray;
  }

  minimumOneTagValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const tags = control.value;
      return tags && tags.length > 0 ? null : { minimumOneTag: true };
    };
  }

  onSubmitAddJournal() {
    const journalModal = document.getElementById('journalModal');
    const journalModalInput = document.getElementById('journalModalInput');

    if (this.journalForm.valid) {
      // Create a new journal entry object
      const newJournalEntry = {
        id: uuidv4(),
        title: this.journalForm.value.title || '', // Default to an empty string if null or undefined
        description: this.journalForm.value.description || '', // Default to an empty string if null or undefined
        tags: this.journalForm.value.tagEnter || [], // Default to an empty array if null or undefined
        audio: null as string | null, // Add the recorded audio here
      };
      if (this.recordedAudio) {
        const reader = new FileReader();
        reader.onloadend = () => {
          newJournalEntry.audio = reader.result as string; // Set base64 string
          this.saveJournalEntry(newJournalEntry); // Save entry with audio
        };
        reader.readAsDataURL(this.recordedAudio); // Convert Blob to base64
      } else {
        this.journalEntries.push(newJournalEntry);
        localStorage.setItem(
          'journalEntries',
          JSON.stringify(this.journalEntries)
        );
      }

      // Push the new journal entry to the entries array
      //store to localstorage

      console.log('Form submitted:', this.journalForm.value);
      journalModalInput?.classList.add('hidden');
      journalModal?.classList.remove('hidden');
      this.journalForm.reset();
      this.recordedAudio = null; // Clear recorded audio after submission
      this.currentAudioState = 'initialAudio'; // Reset audio state if necessary
    } else {
      this.journalForm.markAllAsTouched();
      return;
    }
  }

  // Save journal entries to local storage

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

    this.journalForm.reset();
    this.recordedAudio = null;
    this.currentAudioState = 'initialAudio';
    this.tagEnter.clear();
  }

  onAudioResume() {
    const recordingPauseIcon = document.getElementById('recordingPauseIcon');
    const recordingResumeIcon = document.getElementById('recordingResumeIcon');

    recordingPauseIcon?.classList.remove('hidden');
    recordingResumeIcon?.classList.add('hidden');

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

      //save to local storage

      const audioBlob = new Blob(this.recordedChunksAudio, {
        type: 'audio/webm',
      });
      const audioId = `audio_${Date.now()}`;

      // Save the video blob
      await this.audioStorageService.addAudio(audioId, audioBlob);

      // Create a URL for the video blob
      this.audioSrc = URL.createObjectURL(audioBlob);

      // Reset recordedChunksAudio for the next recording
      this.recordedChunksAudio = [];

      // Reload all videos to refresh the display
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
    const recordedPlayIcon = document.getElementById('recordedPlayIcon');
    const recordedPauseIcon = document.getElementById('recordedPauseIcon');

    // Toggle the play/pause icons
    recordedPlayIcon?.classList.add('hidden');
    recordedPauseIcon?.classList.remove('hidden');

    // Ensure there's an audio URL
    if (!this.audioUrl) return;

    // Create an audio player instance and start playing
    this.audioPlayer = new Audio(this.audioUrl);
    this.isPlaying = true;

    this.audioPlayer.play();
    this.startPlaybackTimer();

    // Listen for when the audio ends
    this.audioPlayer.onended = () => {
      // Toggle the icons back to show play when audio ends
      recordedPlayIcon?.classList.remove('hidden');
      recordedPauseIcon?.classList.add('hidden');

      // Reset playback state
      this.isPlaying = false;
      this.playbackTime = 0;
    };
  }
  onPlayRecordedAudio(audioBlob: Blob | null) {
    if (!audioBlob) return;

    const audioUrl = URL.createObjectURL(audioBlob);
    const audioPlayer = new Audio(audioUrl);
    audioPlayer.play();

    audioPlayer.onended = () => {
      URL.revokeObjectURL(audioUrl); // Clean up URL object after playback
    };
  }

  onRecordedPause() {
    const recordedPlayIcon = document.getElementById('recordedPlayIcon');
    const recordedPauseIcon = document.getElementById('recordedPauseIcon');
    recordedPlayIcon?.classList.remove('hidden');
    recordedPauseIcon?.classList.add('hidden');
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

  // Video input

  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.videoElement.nativeElement.srcObject = stream;
    this.mediaRecorderVideo = new MediaRecorder(stream);

    this.mediaRecorderVideo.ondataavailable = (event) => {
      this.recordedChunks.push(event.data);
    };

    this.mediaRecorderVideo.onstop = this.handleStop.bind(this);
    this.mediaRecorderVideo.start();
    this.isRecording = true;
  }

  stopRecording() {
    this.mediaRecorderVideo.stop();
    this.isRecording = false;
  }

  private async handleStop() {
    const videoBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const videoId = `video_${Date.now()}`;

    // Save the video blob
    await this.videoStorageService.addVideo(videoId, videoBlob);

    // Create a URL for the video blob
    this.videoSrc = URL.createObjectURL(videoBlob);

    // Reset recordedChunks for the next recording
    this.recordedChunks = [];

    // Reload all videos to refresh the display
  }

  private async loadAllVideos() {
    this.allVideos = await this.videoStorageService.getAllVideos(); // Fetch all videos
  }

  getVideoUrl(videoBlob: Blob): string {
    return window.URL.createObjectURL(videoBlob);
  }

  async deleteVideo(id: string) {
    await this.videoStorageService.deleteVideo(id); // Delete from storage
    await this.loadAllVideos(); // Reload videos after deletion
  }
  openDeleteConfirmation(id: string) {
    this.videoToDelete = id; // Set the ID of the video to delete
    this.showDeleteConfirmation = true; // Show the confirmation modal
  }

  confirmDelete() {
    if (this.videoToDelete) {
      this.deleteVideo(this.videoToDelete);
    }
    this.closeDeleteConfirmation(); // Close the modal
  }

  closeDeleteConfirmation() {
    this.videoToDelete = null; // Reset the video ID
    this.showDeleteConfirmation = false; // Hide the modal
  }

  // Tag input

  addTag() {
    const tagInput = document.getElementById('tagInput') as HTMLInputElement;
    const tag = tagInput.value.trim();

    if (tag !== '') {
      // Add tag to the FormArray
      this.tagEnter.push(new FormControl(tag, Validators.required));
      this.hasInteractedTags = true;
    } else {
      this.hasInteractedTags = true;
    }

    // Clear the input after the tag is added
    tagInput.value = '';

    // Save the tags to localStorage
    this.saveTagsToLocalStorage();
  }

  onBlurTag() {
    this.hasInteractedTags = true; // Set on focus to ensure the user has interacted with the input
  }

  removeTag(index: number): void {
    this.tagEnter.removeAt(index); // Remove tag from FormArray

    // Save the updated tags to localStorage
    this.saveTagsToLocalStorage();
  }

  // Save the tags from the FormArray to localStorage
  saveTagsToLocalStorage(): void {
    const tags = this.tagEnter.value; // Get all tags from the form
    localStorage.setItem('tags', JSON.stringify(tags));
  }

  loadTagsFromLocalStorage(): void {
    const storedTags = localStorage.getItem('tags');
    if (storedTags) {
      const tags = JSON.parse(storedTags);
      tags.forEach((tag: string) => {
        this.tagEnter.push(new FormControl(tag, Validators.required));
      });
    }
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

  drop(event: CdkDragDrop<any[]>) {
    moveItemInArray(
      this.journalEntries,
      event.previousIndex,
      event.currentIndex
    );
    // Save the new order to localStorage
    localStorage.setItem('journalOrder', JSON.stringify(this.journalEntries));
  }
  onCancelAddJournal() {
    const journalModal = document.getElementById('journalModal');
    const journalModalInput = document.getElementById('journalModalInput');

    journalModalInput?.classList.add('hidden');
    journalModal?.classList.remove('hidden');
  }

  // File Input

  async initIndexedDBFile() {
    await openDB('fileStorageDB', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'name' });
      },
    });
  }

  // On file selection
  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];

      // Generate a URL for viewing the file
      const fileUrl = URL.createObjectURL(file);

      // Add new file to the top of the list
      this.files.unshift({ file, fileUrl, progress: 0, isUploading: true });

      const currentFileIndex = 0; // Since we just added it to the top
      this.storeFile(file);
      this.uploadFile(file, currentFileIndex); // Pass the index of the new file
    }
  }

  // Store the file in IndexedDB
  async storeFile(file: File) {
    const db = await openDB('fileStorageDB', 1);

    // Read the file content as a Data URL
    const reader = new FileReader();
    reader.onload = async () => {
      const fileData = {
        name: file.name,
        type: file.type,
        content: reader.result, // File content as Data URL
      };

      const tx = db.transaction('files', 'readwrite');
      await tx.store.add(fileData); // Store file data (name, type, content)
      await tx.done;

      // After storing, reload the stored files
      await this.loadStoredFiles();
    };
    reader.readAsDataURL(file); // Read file content
  }

  // Simulate file upload and update progress
  uploadFile(file: File, index: number) {
    const upload$ = this.simulateUpload(file);

    upload$.subscribe({
      next: (progress) => {
        this.files[index].progress = progress; // Update progress for the current file
      },
      complete: () => {
        this.files[index].isUploading = false; // Mark file as uploaded
      },
    });
  }

  // Simulated upload (replace with actual API call if needed)
  simulateUpload(file: File): Observable<number> {
    return new Observable((observer) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        observer.next(progress);
        if (progress === 100) {
          clearInterval(interval);
          observer.complete();
        }
      }, 200);
    });
  }

  // Remove file from list and IndexedDB
  async removeFile(index: number) {
    const file = this.files[index].file;
    this.files.splice(index, 1);

    const db = await openDB('fileStorageDB', 1);
    const tx = db.transaction('files', 'readwrite');
    await tx.store.delete(file.name);
    await tx.done;

    await this.loadStoredFiles();
  }

  // Return file type icon based on extension (this is just a sample implementation)
  getFileIcon(file: FileUpload) {
    // For image files, return the data URL to display it
    if (file.file.type.startsWith('image')) {
      return file.fileUrl; // Use the URL generated during upload
    }

    // For other types of files, return a generic icon
    return '../../../assets/images/icons/file-icon.png'; // Replace with actual path for non-image files
  }

  async loadStoredFiles() {
    const db = await openDB('fileStorageDB', 1);
    const tx = db.transaction('files', 'readonly');
    const store = tx.store;
    const allFiles = await store.getAll(); // Get all stored files
    await tx.done;

    this.storedFiles = allFiles; // Save them in storedFiles array
  }
  saveJournalEntry(newJournalEntry: any) {
    this.journalEntries.push(newJournalEntry); // Add to journalEntries array
    localStorage.setItem('journalEntries', JSON.stringify(this.journalEntries)); // Save to localStorage

    console.log('Form submitted:', newJournalEntry);
    this.journalForm.reset(); // Reset the form
    this.recordedAudio = null; // Clear recorded audio
    this.currentAudioState = 'initialAudio'; // Reset audio state
  }

  loadJournalEntries() {
    const entries = localStorage.getItem('journalEntries');
    if (entries) {
      this.journalEntries = JSON.parse(entries);
    }
  }

  displayJournalEntry(index: number) {
    this.selectedEntry = this.journalEntries[index];
  }
}
