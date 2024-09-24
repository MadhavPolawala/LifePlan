import { Routes } from '@angular/router';
import { JournalComponent } from './pages/journal/journal.component';

export const routes: Routes = [
  {
    path: 'journal',
    component: JournalComponent,
  },
  {
    path: '',
    redirectTo: 'journal',
    pathMatch: 'full',
  },
];
