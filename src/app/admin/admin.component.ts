import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin',
  standalone: true,
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
  imports: [CommonModule, FormsModule, RouterModule]
})
export class AdminComponent implements OnInit {
  users: any[] = [];
  selectedUser: string | null = null;
  chatHistory: any[] = [];
  message: string = '';
  errorMessage: string = '';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    if (!this.authService.isAuthenticated() || !this.authService.isAdmin()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadUsers();
  }

  loadUsers() {
    const token = this.authService.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get(`${environment.apiUrl}/admin/users`, { headers })
      .subscribe({
        next: (response: any) => {
          this.users = response.users || [];
        },
        error: (error) => {
          this.errorMessage = error?.error?.message || 'Failed to load users.';
        }
      });
  }

  deleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    const token = this.authService.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.delete(`${environment.apiUrl}/admin/users/${userId}`, { headers })
      .subscribe({
        next: () => {
          this.message = 'User deleted successfully.';
          this.users = this.users.filter(user => user._id !== userId);
          if (this.selectedUser === userId) {
            this.selectedUser = null;
            this.chatHistory = [];
          }
        },
        error: (error) => {
          this.errorMessage = error?.error?.message || 'Failed to delete user.';
        }
      });
  }

  viewChatHistory(userId: string) {
    this.selectedUser = userId;
    const token = this.authService.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    this.http.get(`${environment.apiUrl}/admin/messages/${userId}`, { headers })
      .subscribe({
        next: (response: any) => {
          this.chatHistory = response.messages || [];
        },
        error: (error) => {
          this.errorMessage = error?.error?.message || 'Failed to load chat history.';
        }
      });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
