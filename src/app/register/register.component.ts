import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  imports: [FormsModule, CommonModule, RouterModule]
})
export class RegisterComponent {
  model: any = {};
  errorMessage: string = '';
  message: string = '';
  passwordStrength: number = 0;
  passwordStrengthText: string = '';
  passwordStrengthColor: string = '';
  constructor(private authService: AuthService, private router: Router) {}

  onSubmit() {
    this.errorMessage = '';

    if (!this.model.username) {
      this.errorMessage = 'Please enter your name.';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.model.email || !emailRegex.test(this.model.email)) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    if (this.model.password.length < 8) {
      this.errorMessage = 'Password must be at least 8 characters long.';
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(this.model.password)) {
      this.errorMessage = 'Password must include uppercase, lowercase, numbers, and special characters.';
      return;
    }

    if (this.model.password !== this.model.confirmPassword) {
      this.errorMessage = 'Passwords do not match!';
      return;
    }

    if (!this.model.dob) {
      this.errorMessage = 'Please enter your date of birth.';
      return;
    }

    if (!this.model.gender) {
      this.errorMessage = 'Please select your gender.';
      return;
    }

    if (!this.model.terms) {
      this.errorMessage = 'You must agree to the terms and conditions.';
      return;
    }

    const selectedDate = new Date(this.model.dob);
    const today = new Date();
    if (selectedDate > today) {
      this.errorMessage = 'Date of birth cannot be in the future.';
      return;
    }

    this.authService
      .register({
        username: this.model.username,
        email: this.model.email,
        password: this.model.password
      })
      .subscribe({
        next: (response: { message: string }) => {
          this.message = response.message || 'Registration successful!';
          this.model = {};
          this.router.navigate(['/login']);
        },
        error: (error) => {
          this.errorMessage = error?.error?.message || 'An unexpected error occurred during registration!';
        }
      });
  }

  checkPasswordStrength() {
    const password = this.model.password;
    this.passwordStrength = 0;
    this.passwordStrengthText = '';
    this.passwordStrengthColor = '';

    if (!password) return;

    let strength = 0;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[!@#$%^&*]/.test(password)) strength += 1;
    if (password.length >= 8) strength += 1;

    this.passwordStrength = (strength / 5) * 100;

    if (this.passwordStrength < 40) {
      this.passwordStrengthColor = 'red';
      this.passwordStrengthText = 'Weak';
    } else if (this.passwordStrength < 70) {
      this.passwordStrengthColor = 'orange';
      this.passwordStrengthText = 'Moderate';
    } else {
      this.passwordStrengthColor = 'green';
      this.passwordStrengthText = 'Strong';
    }
  }
}
