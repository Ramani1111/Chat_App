import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule], // Import RouterModule for navigation
  template: `<router-outlet></router-outlet>`, // Use router-outlet for routing
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'ChatsApp';
}
