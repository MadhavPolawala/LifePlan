import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
} from '@angular/core';
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
import { findIndex, from, Observable } from 'rxjs';
import { FileSizePipe } from '../../file-size.pipe';
import { VideoStorageService } from '../../services/video-storage.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { v4 as uuidv4 } from 'uuid';
import { ActivatedRoute } from '@angular/router';
import { AudioStorageService } from '../../services/audio-storage.service';
import jsPDF from 'jspdf';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
interface FileUpload {
  fileUrl: any;
  file: File;
  progress: number;
  isUploading: boolean;
}
interface JournalFile {
  fileName: string;
  fileType: string;
  content: string;
  url: string | null;
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
    PickerComponent,
  ],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.css',
})
export class JournalComponent implements OnInit {
  newPageModal: boolean = false;
  pagesArray: any[] = [];
  showLess: { [key: string]: boolean } = {};
  pageEditMode: boolean = false;
  selectedPageId: string | null = null;
  pageDeleteConfirmationModal: boolean = false;
  showEmojiPicker: boolean = false;
  selectedEmoji: any = null;
  mobileView: boolean = false;
  creatingNewJournal: boolean = false;
  isEditDelete: boolean = false;
  editMode: boolean = false;

  currentAudioState: 'initialAudio' | 'recordingAudio' | 'recordedAudio' =
    'initialAudio';
  isPaused = false;
  isPlaying = false;
  recordingTime = 0;
  maxRecordingTime = 60;
  recordedAudio: any;
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
  videoStored: string | null = null;
  allVideos: { id: string; videoBlob: Blob }[] = [];
  showDeleteConfirmation = false;
  videoToDelete: string | null = null;
  videoBlob: any;
  recordedVideo: any;
  videoUrl: string | null = null;

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
    video: any;
    files: any;
    created: string;
  }[] = [];
  selectedJournalEntry: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    audio: any;
    video: any;
    files: any;
    created: string;
  } | null = null;
  selectedEntry: any;
  flag: string = '';

  sanitizedDescription: SafeHtml | null = null;

  whatsAppURL: any;

  onSelectJournalEntry(entry: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    audio: any;
    video: any;
    files: any;
    created: string;
  }) {
    this.selectedJournalEntry = entry;
  }

  journalForm = new FormGroup({
    title: new FormControl('', [Validators.required]),
    description: new FormControl('', [Validators.required]),
    tagEnter: new FormArray([], [this.minimumOneTagValidator()]),
  });

  newPageForm = new FormGroup({
    pageName: new FormControl('', [Validators.required]),
    pageIcon: new FormControl('', [Validators.required]),
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
    });
    this.pagesArray = JSON.parse(localStorage.getItem('pages') || '[]');

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
    this.loadJournalEntries();

    this.checkScreenWidth();
    this.loadPagesFromLocalStorage();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenWidth();
  }

  checkScreenWidth() {
    this.mobileView = window.innerWidth <= 1023;
    if (this.mobileView) {
      this.mobileView = true;
    }
  }

  createNewPage() {
    this.newPageForm.reset();
    this.newPageModal = true;
  }

  closeNewPageModal() {
    this.selectedEmoji = null;
    this.newPageForm.reset();
    this.newPageModal = false;
    this.showEmojiPicker = false;
    this.pageEditMode = false;
  }

  openOption(page: any) {
    for (let key in this.showLess) {
      if (this.showLess.hasOwnProperty(key)) {
        if (key !== page.id) {
          this.showLess[key] = false;
        }
      }
    }
    this.showLess[page.id] = !this.showLess[page.id];
  }

  onEmojiSelect(event: any) {
    this.selectedEmoji = event;
    console.log(this.selectedEmoji);

    this.newPageForm.patchValue({
      pageIcon: event.emoji.native, // Store the native emoji in the form
    });
  }

  editPage(page: any) {
    this.newPageForm.patchValue({
      pageName: page.name,
      pageIcon: page.icon,
    });
    this.selectedPageId = page.id;
    this.pageEditMode = true;
    this.newPageModal = true;
    this.showLess[page.id] = false;
  }

  onAddNewPage() {
    if (this.newPageForm.valid) {
      const newPage = {
        id: uuidv4(),
        name: this.newPageForm.value.pageName,
        icon: this.newPageForm.value.pageIcon,
        created: new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
        }),
      };

      this.pagesArray.push(newPage);
      localStorage.setItem('pages', JSON.stringify(this.pagesArray));

      // Reset form and selected emoji after creating a page
      this.pageEditMode = false;
      this.newPageModal = false;
      this.newPageForm.reset();
      this.selectedEmoji = null;
    } else {
      this.newPageForm.markAllAsTouched();
    }
  }

  updatePage() {
    if (this.selectedPageId) {
      // Find the index of the page to update
      const pageIndex = this.pagesArray.findIndex(
        (page) => page.id === this.selectedPageId
      );

      if (pageIndex !== -1) {
        // Update the page in the array
        this.pagesArray[pageIndex] = {
          ...this.pagesArray[pageIndex],
          name: this.newPageForm.value.pageName,
          icon: this.newPageForm.value.pageIcon,
        };

        // Save the updated array to localStorage
        localStorage.setItem('pages', JSON.stringify(this.pagesArray));

        // Reset form and close the modal
        this.pageEditMode = false;
        this.newPageModal = false;
        this.newPageForm.reset();
      }
    }
  }

  openDeleteConfirmationPage(pageId: string) {
    this.selectedPageId = pageId; // Store the ID of the page to delete
    this.pageDeleteConfirmationModal = true; // Show the confirmation modal
  }

  closeDeleteConfirmationPage() {
    this.pageDeleteConfirmationModal = false; // Hide the confirmation modal
    this.selectedPageId = null; // Reset the selectedPageId
  }

  confirmDeletePage(pageId: string | null) {
    if (pageId) {
      // Filter out the page to be deleted from the array
      this.pagesArray = this.pagesArray.filter((page) => page.id !== pageId);

      // Save the updated array to localStorage
      localStorage.setItem('pages', JSON.stringify(this.pagesArray));

      // Reset the modal and selectedPageId
      this.pageDeleteConfirmationModal = false;
      this.selectedPageId = null;
    }
  }

  loadPagesFromLocalStorage() {
    const storedPages = localStorage.getItem('pages');
    if (storedPages) {
      this.pagesArray = JSON.parse(storedPages);
    }
  }

  toggleSidebar() {
    const logoSidebar = document.getElementById('logoSidebar');
    const appSidebar = document.getElementById('appSidebar');
    const appSidebarSmall = document.getElementById('appSidebarSmall');
    const journalSide = document.getElementById('journalSide');
    const journalModal = document.getElementById('journalModal');
    const searchBar = document.getElementById('searchBar');
    const journalModalInput = document.getElementById('journalModalInput');

    if (logoSidebar) {
      logoSidebar.classList.add('w-9');
    }

    if (appSidebar) {
      appSidebar.classList.add('hidden');
    }

    if (appSidebarSmall) {
      appSidebarSmall.classList.remove('hidden');
    }

    if (journalSide) {
      journalSide.classList.remove('lg:ml-64');
      journalSide.classList.add('lg:ml-10');
    }

    if (journalModal) {
      journalModal.classList.remove('lg:ml-[542px]');
      journalModal.classList.add('lg:ml-[332px]');
    }
    if (searchBar) {
      searchBar.classList.remove('ps-72');
      searchBar.classList.add('ps-12');
    }
    if (journalModalInput) {
      journalModalInput.classList.remove('lg:ml-[542px]');
      journalModalInput.classList.add('lg:ml-[332px]');
    }
  }

  showAppSidebar() {
    const logoSidebar = document.getElementById('logoSidebar');
    const appSidebar = document.getElementById('appSidebar');
    const appSidebarSmall = document.getElementById('appSidebarSmall');

    const journalModal = document.getElementById('journalModal');
    const journalSide = document.getElementById('journalSide');
    const searchBar = document.getElementById('searchBar');
    const journalModalInput = document.getElementById('journalModalInput');

    if (logoSidebar) {
      logoSidebar.classList.remove('w-9');
    }
    if (appSidebar) {
      appSidebar.classList.remove('hidden');
    }
    if (appSidebarSmall) {
      appSidebarSmall.classList.add('hidden');
    }
    if (journalSide) {
      journalSide.classList.remove('lg:ml-10');
      journalSide.classList.add('ml-64');
    }
    if (journalModal) {
      journalModal.classList.remove('lg:ml-[332px]');
      journalModal.classList.add('lg:ml-[542px]');
    }
    if (searchBar) {
      searchBar.classList.remove('ps-12');
      searchBar.classList.add('ps-72');
    }
    if (journalModalInput) {
      journalModalInput.classList.remove('lg:ml-[332px]');
      journalModalInput.classList.add('lg:ml-[542px]');
    }
  }

  goBackJournalMobile() {
    if (this.mobileView) {
      const journalModal = document.getElementById('journalModal');
      const journalSide = document.getElementById('journalSide');

      if (journalModal) {
        journalModal.classList.add('hidden');
      }
      if (journalSide) {
        journalSide.classList.remove('hidden');
      }
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

  get pageName() {
    return this.newPageForm.get('pageName');
  }

  get pageIcon() {
    return this.newPageForm.get('pageIcon');
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
      const newJournalEntry = {
        id: uuidv4(),
        title: this.journalForm.value.title || '',
        description: this.journalForm.value.description || '',
        tags: this.journalForm.value.tagEnter || [],
        audio: null as string | null,
        video: null as string | null,
        files: [] as any[],
        created: new Date(),
      };

      const promises: Promise<void>[] = [];

      if (this.recordedAudio) {
        const audioPromise = new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            newJournalEntry.audio = reader.result as string;
            resolve();
          };
          reader.readAsDataURL(this.recordedAudio);
        });
        promises.push(audioPromise);
      }

      if (this.recordedVideo) {
        const videoPromise = new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            newJournalEntry.video = reader.result as string;
            resolve();
          };
          reader.readAsDataURL(this.recordedVideo);
        });
        promises.push(videoPromise);
      }

      if (this.files.length > 0) {
        const filePromises = this.files.map((fileEntry, index) => {
          return new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              newJournalEntry.files.push({
                fileName: fileEntry.file.name,
                fileType: fileEntry.file.type,
                content: reader.result as string,
                url: null,
              });
              resolve();
            };
            reader.readAsDataURL(fileEntry.file);
          });
        });
        promises.push(...filePromises);
      }

      Promise.all(promises).then(() => {
        this.saveJournalEntry(newJournalEntry);
      });

      //file input

      journalModalInput?.classList.add('hidden');
      journalModal?.classList.remove('lg:hidden');
      this.journalForm.reset();
      this.recordingTime = 0;
      this.recordedAudio = null;
      this.recordedVideo = null;
      this.currentAudioState = 'initialAudio';
      this.files = [];
      this.creatingNewJournal = false;
      if (this.mobileView) {
        const journalSide = document.getElementById('journalSide');
        journalSide?.classList.remove('hidden');
      }
    } else {
      this.journalForm.markAllAsTouched();
      return;
    }
  }

  openJournalModal() {
    this.journalModal = !this.journalModal;
  }

  openSearch() {
    const journalSearch1 = document.getElementById('journalSearch1');
    const journalSearch2 = document.getElementById('journalSearch2');
    const searchInput = journalSearch2?.querySelector('input');

    if (!journalSearch1 || !journalSearch2 || !searchInput) return;

    journalSearch1.classList.add('-translate-x-full', 'opacity-0');
    journalSearch1.classList.remove('translate-x-0', 'opacity-100');

    setTimeout(() => {
      journalSearch1.classList.add('hidden');

      journalSearch2.classList.remove('hidden');
      journalSearch2.classList.remove('-translate-x-full', 'opacity-0');
      journalSearch2.classList.add('translate-x-0', 'opacity-100');

      searchInput.focus();
    }, 300);
  }

  closeSearch() {
    const journalSearch1 = document.getElementById('journalSearch1');
    const journalSearch2 = document.getElementById('journalSearch2');

    if (!journalSearch1 || !journalSearch2) return;

    journalSearch2.classList.add('-translate-x-full', 'opacity-0');
    journalSearch2.classList.remove('translate-x-0', 'opacity-100');

    setTimeout(() => {
      journalSearch2.classList.add('hidden');

      journalSearch1.classList.remove('hidden');
      journalSearch1.classList.remove('translate-x-full', 'opacity-0');
      journalSearch1.classList.add('translate-x-0', 'opacity-100');
    }, 300);
  }
  createJournal() {
    this.creatingNewJournal = true;
    this.editMode = false;
    const journalModal = document.getElementById('journalModal');
    const journalModalInput = document.getElementById('journalModalInput');
    const tagInput = document.getElementById('tagInput') as HTMLInputElement;

    journalModal?.classList.add('lg:hidden');
    journalModalInput?.classList.remove('hidden');

    if (this.mobileView) {
      const journalSide = document.getElementById('journalSide');
      journalSide?.classList.add('hidden');
    }

    this.journalForm.reset();
    this.videoBlob = null;
    this.currentAudioState = 'initialAudio';

    this.tagEnter.clear();
    tagInput.value = '';
    this.selectedEntry = null;
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

      const audioBlob = new Blob(this.recordedChunksAudio, {
        type: 'audio/webm',
      });
      const audioId = `audio_${Date.now()}`;

      await this.audioStorageService.addAudio(audioId, audioBlob);

      this.audioSrc = URL.createObjectURL(audioBlob);

      this.recordedChunksAudio = [];

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

    recordedPlayIcon?.classList.add('hidden');
    recordedPauseIcon?.classList.remove('hidden');

    if (!this.audioUrl) return;

    this.audioPlayer = new Audio(this.audioUrl);
    this.isPlaying = true;

    this.audioPlayer.play();
    this.startPlaybackTimer();

    this.audioPlayer.onended = () => {
      recordedPlayIcon?.classList.remove('hidden');
      recordedPauseIcon?.classList.add('hidden');

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
      URL.revokeObjectURL(audioUrl);
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
    const recordingPauseIcon = document.getElementById('recordingPauseIcon');
    const recordingResumeIcon = document.getElementById('recordingResumeIcon');

    recordingPauseIcon?.classList.add('hidden');
    recordingResumeIcon?.classList.remove('hidden');
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

  deleteAudio(entry: any) {
    let findIndexAudio = this.journalEntries.findIndex(
      (entries) => entries.id == this.selectedEntry.id
    );
    let removeEntriesAudio = entry;
    removeEntriesAudio.audio = null;
    this.closeDeleteConfirmation();
    console.log('findIndexAudio', removeEntriesAudio);
    if (findIndexAudio != -1) {
      this.journalEntries.splice(findIndexAudio, 1, removeEntriesAudio);
      localStorage.setItem('journalOrder', JSON.stringify(this.journalEntries));
    }
  }

  // ---------------------------------------------  Video input  ---------------------------------------------------

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
    this.handleStop();
  }

  handleStop() {
    this.mediaRecorderVideo.stop();
    this.mediaRecorderVideo!.onstop = async () => {
      this.recordedVideo = new Blob(this.recordedChunks, {
        type: 'video/webm',
      });
      this.videoUrl = URL.createObjectURL(this.recordedVideo);

      const videoBlob = new Blob(this.recordedChunks, {
        type: 'video/webm',
      });
      const videoId = `video_${Date.now()}`;

      await this.videoStorageService.addVideo(videoId, videoBlob);

      this.videoStored = URL.createObjectURL(videoBlob);

      this.recordedChunks = [];
    };
  }

  private async loadAllVideos() {
    this.allVideos = await this.videoStorageService.getAllVideos();
  }

  getVideoUrl(videoBlob: Blob): string {
    return window.URL.createObjectURL(videoBlob);
  }

  async deleteVideo(id: string) {
    await this.videoStorageService.deleteVideo(id);
    await this.loadAllVideos();
  }
  openDeleteConfirmation(entry: any, isFlag: string) {
    // this.videoToDelete = id;
    this.flag = isFlag;
    this.showDeleteConfirmation = true;
  }

  confirmDelete(entry: any) {
    if (this.flag === '') return;

    if (this.flag === 'video') {
      let findIndex = this.journalEntries.findIndex(
        (entries) => entries.id == this.selectedEntry.id
      );
      let removeEntries = entry;
      removeEntries.video = null;
      this.closeDeleteConfirmation();
      console.log('findIndex', removeEntries);
      if (findIndex != -1) {
        this.journalEntries.splice(findIndex, 1, removeEntries);
        localStorage.setItem(
          'journalOrder',
          JSON.stringify(this.journalEntries)
        );
      }
      return;
    }
    if (this.flag === 'audio') {
      this.deleteAudio(this.selectedEntry);
    }
  }

  closeDeleteConfirmation() {
    this.showDeleteConfirmation = false;
    this.flag = '';
  }

  // ---------------------------------------------------------Tag input------------------------------------------------

  addTag() {
    const tagInput = document.getElementById('tagInput') as HTMLInputElement;
    const tag = tagInput.value.trim();

    if (tag !== '') {
      this.tagEnter.push(new FormControl(tag, Validators.required));
      this.hasInteractedTags = true;
    } else {
      this.hasInteractedTags = true;
    }

    tagInput.value = '';

    this.saveTagsToLocalStorage();
  }

  onBlurTag() {
    this.hasInteractedTags = true;
  }

  removeTag(index: number): void {
    this.tagEnter.removeAt(index);

    this.saveTagsToLocalStorage();
  }

  saveTagsToLocalStorage(): void {
    const tags = this.tagEnter.value;
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
      this.fileNames = Array.from(files).map((file) => file.name);

      for (const file of Array.from(files)) {
        const fileData = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: await this.convertFileToBase64(file),
        };

        await this.storeFileInIndexedDB(fileData);
      }
    }
  }

  convertFileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

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
    localStorage.setItem('journalOrder', JSON.stringify(this.journalEntries));
  }
  onCancelAddJournal() {
    const journalModal = document.getElementById('journalModal');
    const journalModalInput = document.getElementById('journalModalInput');

    journalModalInput?.classList.add('hidden');
    journalModal?.classList.remove('lg:hidden');

    if (this.mobileView) {
      const journalSide = document.getElementById('journalSide');
      const journalModal = document.getElementById('journalModal');
      if (!this.creatingNewJournal) {
        journalModal?.classList.remove('hidden');
      }

      if (this.creatingNewJournal) {
        journalSide?.classList.remove('hidden');
      }
    }

    this.creatingNewJournal = false;
  }

  // -------------------------------------------------File Input-------------------------------------------------------

  async initIndexedDBFile() {
    await openDB('fileStorageDB', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'name' });
      },
    });
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];

      const fileUrl = URL.createObjectURL(file);

      this.files.unshift({ file, fileUrl, progress: 0, isUploading: true });

      const currentFileIndex = 0;
      this.storeFile(file);
      this.uploadFile(file, currentFileIndex);
    }
  }

  async storeFile(file: File) {
    const db = await openDB('fileStorageDB', 1);

    const reader = new FileReader();
    reader.onload = async () => {
      const fileData = {
        name: file.name,
        type: file.type,
        content: reader.result,
      };

      const tx = db.transaction('files', 'readwrite');
      await tx.store.add(fileData);
      await tx.done;

      await this.loadStoredFiles();
    };
    reader.readAsDataURL(file);
  }

  uploadFile(file: File, index: number) {
    const upload$ = this.simulateUpload(file);

    upload$.subscribe({
      next: (progress) => {
        this.files[index].progress = progress;
      },
      complete: () => {
        this.files[index].isUploading = false;
      },
    });
  }

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

  async removeFile(index: number) {
    const file = this.files[index].file;
    this.files.splice(index, 1);

    const db = await openDB('fileStorageDB', 1);
    const tx = db.transaction('files', 'readwrite');
    await tx.store.delete(file.name);
    await tx.done;

    await this.loadStoredFiles();
  }

  getFileIcon(file: FileUpload) {
    if (file.file.type.startsWith('image')) {
      return file.fileUrl;
    }

    return '../../../assets/images/icons/file-icon.png';
  }

  async loadStoredFiles() {
    const db = await openDB('fileStorageDB', 1);
    const tx = db.transaction('files', 'readonly');
    const store = tx.store;
    const allFiles = await store.getAll();
    await tx.done;

    this.storedFiles = allFiles;
  }

  deleteFileFromJournalEntry(journalId: string, fileIndex: number) {
    const journalEntryIndex = this.journalEntries.findIndex(
      (entry) => entry.id === journalId
    );

    if (journalEntryIndex === -1) {
      console.error('Journal entry not found');
      return;
    }

    const journalEntry = this.journalEntries[journalEntryIndex];

    journalEntry.files.splice(fileIndex, 1);

    this.journalEntries[journalEntryIndex] = journalEntry;
    localStorage.setItem('journalOrder', JSON.stringify(this.journalEntries));

    this.loadJournalEntries();
  }

  saveJournalEntry(newJournalEntry: any) {
    let journalOrder = localStorage.getItem('journalOrder');

    this.journalEntries.push(newJournalEntry);
    let getNewEntry = this.journalEntries[this.journalEntries.length - 1];

    if (journalOrder) {
      try {
        let journalOrderArray = JSON.parse(journalOrder);

        journalOrderArray.push(getNewEntry);

        localStorage.setItem('journalOrder', JSON.stringify(journalOrderArray));
      } catch (e) {
        console.error('Error parsing journalOrder:', e);
      }
    } else {
      let journalOrderArray = [getNewEntry];

      localStorage.setItem('journalOrder', JSON.stringify(journalOrderArray));
    }

    this.journalForm.reset();
    this.recordedAudio = null;
    this.videoBlob = null;
    this.currentAudioState = 'initialAudio';
  }

  loadJournalEntries() {
    const entries = localStorage.getItem('journalOrder');
    if (entries) {
      this.journalEntries = JSON.parse(entries);

      this.journalEntries.forEach((entry) => {
        entry.files.forEach((file: JournalFile) => {
          if (file.content) {
            const byteString = atob(file.content.split(',')[1]);
            const mimeString = file.content
              .split(',')[0]
              .split(':')[1]
              .split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });

            file.url = URL.createObjectURL(blob);
          } else {
            file.url = null;
          }
        });
      });
    }
  }

  displayJournalEntry(index: number) {
    this.creatingNewJournal = false;
    this.selectedEntry = this.journalEntries[index];
    const journalModalInput = document.getElementById('journalModalInput');
    const journalModal = document.getElementById('journalModal');
    if (journalModal) {
      journalModal.classList.remove('lg:hidden');
      journalModalInput?.classList.add('hidden');
    }
    if (this.mobileView) {
      const journalSide = document.getElementById('journalSide');
      if (journalModal) {
        journalModal.classList.remove('hidden');
      }
      if (journalSide) {
        journalSide.classList.add('hidden');
      }
    }
    this.whatsAppURL = `https://wa.me/?text=Check out this journal entry: Title : ${this.journalEntries[index].title}`;
  }

  onOptionEditDelete(index: number) {
    this.isEditDelete = !this.isEditDelete;
  }

  onDeleteJournalEntry(index: number) {
    this.isEditDelete = false;
    window.confirm(
      `Are you sure you want to delete ${this.journalEntries[index].title}?`
    )
      ? this.deleteJournalEntry(index)
      : null;
  }

  deleteJournalEntry(index: number) {
    this.journalEntries.splice(index, 1);
    localStorage.setItem('journalOrder', JSON.stringify(this.journalEntries));
    this.loadJournalEntries();
    window.location.reload();
  }

  onEditJournalEntry(index: number) {
    const journalModalInput = document.getElementById('journalModalInput');
    const journalModal = document.getElementById('journalModal');
    if (journalModal) {
      journalModal.classList.add('lg:hidden');
      journalModalInput?.classList.remove('hidden');
    }

    if (this.mobileView) {
      const journalModal = document.getElementById('journalModal');
      journalModal?.classList.add('hidden');
    }

    this.editMode = true;
    const tagInput = document.getElementById('tagInput') as HTMLInputElement;
    tagInput.value = '';
    this.tagEnter.clear();

    this.selectedEntry = this.journalEntries[index];
    this.isEditDelete = false;
  }

  updateSelectedEntry() {
    const journalModalInput = document.getElementById('journalModalInput');
    const journalModal = document.getElementById('journalModal');

    const currentEntryIndex = this.journalEntries.findIndex(
      (entry) => entry.id === this.selectedEntry.id
    );
    if (currentEntryIndex === -1) {
      console.error('Journal entry not found');
      return;
    }

    const updatedJournalEntry = { ...this.selectedEntry };

    updatedJournalEntry.title = this.journalForm.value.title;
    updatedJournalEntry.description = this.journalForm.value.description;
    updatedJournalEntry.tags = this.journalForm.value.tagEnter;

    const promises: Promise<void>[] = [];

    if (this.recordedAudio) {
      const audioPromise = new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          updatedJournalEntry.audio = reader.result as string;
          resolve();
        };
        reader.readAsDataURL(this.recordedAudio);
      });
      promises.push(audioPromise);
    }

    if (this.recordedVideo) {
      const videoPromise = new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          updatedJournalEntry.video = reader.result as string;
          resolve();
        };
        reader.readAsDataURL(this.recordedVideo);
      });
      promises.push(videoPromise);
    }

    if (this.files.length > 0) {
      const filePromises = this.files.map((fileEntry) => {
        return new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            updatedJournalEntry.files.push({
              fileName: fileEntry.file.name,
              fileType: fileEntry.file.type,
              content: reader.result as string,
              url: null,
            });
            resolve();
          };
          reader.readAsDataURL(fileEntry.file);
        });
      });
      promises.push(...filePromises);
    }

    Promise.all(promises).then(() => {
      this.journalEntries[currentEntryIndex] = updatedJournalEntry;

      localStorage.setItem('journalOrder', JSON.stringify(this.journalEntries));

      this.editMode = false;
      this.journalForm.reset();
      this.recordedAudio = null;
      this.recordedVideo = null;
      this.files = [];
      this.currentAudioState = 'initialAudio';

      if (journalModal) {
        journalModal.classList.remove('lg:hidden');
        journalModalInput?.classList.add('hidden');
      }
      if (this.mobileView) {
        journalModal?.classList.remove('hidden');
      }
    });
  }

  generatePDF(entry: any) {
    const doc = new jsPDF();

    let findIndex = this.journalEntries.findIndex(
      (entries) => entries.id === this.selectedEntry.id
    );

    const data = this.journalEntries[findIndex];
    console.log('data', data);

    // Check if data is not null
    if (!data) {
      console.error('No journal entry selected!');
      return; // Exit the function if data is null
    }

    let currentY = 10; // Start position for vertical stacking

    // Add title
    doc.setFontSize(18);
    doc.text(data.title, 10, currentY);
    currentY += 10; // Add some space after the title

    // Add tags and handle multi-line if needed
    if (data.tags && data.tags.length > 0) {
      const tagsText = `Tags: ${data.tags.join(', ')}`;
      doc.setFontSize(12);
      const splitTags = doc.splitTextToSize(tagsText, 180); // Adjust the width based on PDF
      doc.text(splitTags, 10, currentY);
      currentY += splitTags.length * 10; // Adjust position based on the number of lines
    }

    // Add description in full width
    if (data.description) {
      const tempElement = document.createElement('div');
      tempElement.innerHTML = data.description;

      // Style the temporary element
      const style = document.createElement('style');
      style.innerHTML = `
      img {
        max-width: 100%; 
        height: auto; 
        display: block; 
        margin: 0 auto;
        margin-bottom: 10px;
      }
    `;
      document.head.appendChild(style);
      tempElement.appendChild(style);

      document.body.appendChild(tempElement);

      doc.html(tempElement, {
        callback: (doc) => {
          if (document.body.contains(tempElement)) {
            document.body.removeChild(tempElement);
          }
          if (document.head.contains(style)) {
            document.head.removeChild(style); // Remove the style after use
          }
          currentY += 10; // Move down after the description

          // Check if there are images to add
          this.addImagesToPDF(data.files, doc, currentY);
        },
        x: 10,
        y: currentY,
        html2canvas: {
          scale: 0.2,
        },
      });
    } else {
      console.error('No description available!');
    }
  }

  // Function to add images to the PDF
  addImagesToPDF(files: JournalFile[], doc: jsPDF, currentY: number) {
    if (files && files.length > 0) {
      const imagePromises: Promise<void>[] = files.map((file: JournalFile) => {
        return new Promise<void>((resolve) => {
          if (file.content) {
            const img = new Image();
            img.src = file.content;

            img.onload = () => {
              const desiredWidth = 25; // Adjust this value as needed
              const desiredHeight = (img.height / img.width) * desiredWidth; // Maintain aspect ratio

              currentY += 10; // Add some space before each image
              if (
                currentY + desiredHeight >
                doc.internal.pageSize.height - 20
              ) {
                doc.addPage(); // Add new page if image exceeds the current page height
                currentY = 10; // Reset Y position for new page
              }

              // Add image to PDF
              doc.addImage(
                img,
                'JPEG',
                10,
                currentY,
                desiredWidth,
                desiredHeight
              ); // Add image with new size
              currentY += desiredHeight; // Update Y position after image
              resolve(); // Resolve the promise after the image is added
            };
          } else {
            resolve(); // Resolve if no image
          }
        });
      });

      // Wait for all images to load before saving the PDF
      Promise.all(imagePromises).then(() => {
        const pdfBlob = doc.output('blob'); // Get the PDF as a blob
        this.uploadPDF(pdfBlob); // Call the upload function
      });
    } else {
      const pdfBlob = doc.output('blob'); // Get the PDF as a blob if no images
      this.uploadPDF(pdfBlob); // Call the upload function
    }
  }

  uploadPDF(pdfBlob: Blob) {
    const formData = new FormData();
    formData.append('file', pdfBlob, 'journal.pdf');
    const uploadUrl = 'http://localhost:3000/upload'; // Correct endpoint

    fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((data) => {
        console.log('File available at:', data.url); // Log server response URL
        if (this.selectedEntry) {
          this.selectedEntry.blobUrl = data.url; // Assign the URL to blobUrl property
          console.log('selectedEntry:', this.selectedEntry); // Log entire object

          // Share the PDF on WhatsApp
          this.shareOnWhatsApp(this.selectedEntry.blobUrl); // Share after setting the URL
        } else {
          console.error('selectedEntry is undefined');
        }
      })
      .catch((error) => {
        console.error('Upload failed:', error);
      });
  }

  shareOnWhatsApp(pdfUrl: string) {
    if (!pdfUrl) {
      console.error('No URL provided for sharing on WhatsApp');
      return;
    }

    const whatsappUrl = `https://wa.me/?text=Check%20out%20this%20journal%20PDF!%20${encodeURIComponent(
      pdfUrl
    )}`;
    window.open(whatsappUrl, '_blank');
  }
}
