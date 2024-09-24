import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fileSize',
  standalone: true, // <-- Add this line to make it standalone
})
export class FileSizePipe implements PipeTransform {
  transform(size: number): string {
    return (size / 1024).toFixed(2); // Converts bytes to KB
  }
}
