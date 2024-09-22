import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [HttpClientModule],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.css',
})
export class JournalComponent implements OnInit {
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

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get('/assets/data/slidebar.json').subscribe((data) => {
      this.jsonData = data;
      this.navbarJson = this.jsonData.navbar;
      this.sharedJson = this.jsonData.shared;
      this.privateJson = this.jsonData.private;
      console.log(this.jsonData);
      console.log(this.currentDate);
    });
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

    journalStart?.classList.add('hidden');
    journalModal?.classList.remove('hidden');
  }
}
