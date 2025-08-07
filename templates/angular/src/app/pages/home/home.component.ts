import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CounterComponent } from '../../components/counter/counter.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, CounterComponent, LucideAngularModule],
  templateUrl: './home.component.html'
})
export class HomeComponent {
  features = [
    'Angular 17 with standalone components',
    'TypeScript support',
    'Routing configured',
    'Component-based architecture',
    'Reactive programming with RxJS'
  ];
}