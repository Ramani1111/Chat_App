import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  imports: [CommonModule, FormsModule, RouterModule]
})
export class LoginComponent {
  user = {
    email: '',
    password: ''
  };
  message: string = '';

  constructor(private router: Router, private authService: AuthService) {}

  onSubmit() {
    if (!this.user.email || !this.user.password) {
      this.message = 'Please enter both email and password.';
      return;
    }

    this.authService.login(this.user).subscribe({
      next: (response: { message?: string; token?: string; isAdmin?: boolean }) => {
        if (response.token) {
          this.authService.saveToken(response.token);
          this.message = '';
          if (response.isAdmin) {
            this.router.navigate(['/admin']);
          } else {
            this.router.navigate(['/chat']);
          }
        } else {
          this.message = response.message || 'Login failed. Please try again.';
        }
      },
      error: (error: any) => {
        this.message = error?.error?.message || 'An error occurred. Please try again later.';
      }
    });
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }
}
