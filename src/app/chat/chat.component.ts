import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { io } from 'socket.io-client';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment'; // Import environment

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, AfterViewChecked {

  showEmojiPicker: boolean = false;
  emojis: string[] = ['😀', '😂', '😍', '😎', '😢', '😡', '👍', '👎', '🎉', '❤️'];
  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  addEmoji(emoji: string) {
    this.messageInput += emoji; // Append the selected emoji to the message input
    this.showEmojiPicker = false; // Close the emoji picker after selection
    this.scrollToBottom(); // Scroll to the bottom if needed
  }
  @ViewChild('messageContainer') private messageContainer!: ElementRef;

  socket: any;
  currentUser: string = '';
  contacts: string[] = [];
  currentChatUser: string = '';
  messageInput: string = '';
  messages: any[] = [];
  isTyping: boolean = false;
  typingTimeout: any;

  constructor(
    private authService: AuthService,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    const token = this.authService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    const payload = JSON.parse(atob(token.split('.')[1]));
    this.currentUser = payload.username;

    this.socket = io(environment.socketUrl, {
      auth: { token }
    });

    this.socket.on('connect', () => {
      this.socket.emit('register-user', this.currentUser);
    });

    this.socket.on('message-received', (data: any) => {
      this.messages.push({
        ...data,
        timestamp: new Date(data.timestamp)
      });
      this.scrollToBottom();
    });

    this.socket.on('message-updated', (data: any) => {
      const index = this.messages.findIndex(msg => msg._id === data._id);
      if (index !== -1) {
        this.messages[index] = { ...data, timestamp: new Date(data.timestamp) };
      }
    });

    this.socket.on('message-deleted', (data: any) => {
      this.messages = this.messages.filter(msg => msg._id !== data._id);
    });

    this.socket.on('typing', (data: any) => {
      if (data.from === this.currentChatUser) {
        this.isTyping = true;
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          this.isTyping = false;
        }, 1000);
      }
    });

    this.socket.on('error', (data: any) => {
      alert(data.message);
    });

    this.loadContacts();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop =
        this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  loadContacts() {
    const token = this.authService.getToken();
    this.http.get<any>(`${environment.apiUrl}/contacts`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).subscribe({
      next: (res) => {
        console.log('Contacts response:', res); // Debug log
        this.contacts = res.contacts || [];
      },
      error: (err) => {
        console.error('Contacts error:', err); // Debug log
        alert('Failed to load contacts: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  openChat(contact: string) {
    this.currentChatUser = contact;
    this.messages = [];
    this.isTyping = false;

    const token = this.authService.getToken();
    this.http.get<any>(`${environment.apiUrl}/messages/${contact}`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).subscribe({
      next: (res) => {
        this.messages = res.messages.map((msg: any) => ({
          ...msg,
          isEditing: false,
          editText: msg.text
        }));
        this.scrollToBottom();
      },
      error: (err) => {
        alert('Failed to load messages: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  sendMessage() {
    if (!this.messageInput.trim()) return;

    const messageData = {
      from: this.currentUser,
      to: this.currentChatUser,
      text: this.messageInput
    };

    this.socket.emit('send-message', messageData);
    this.messageInput = '';
    this.scrollToBottom();
  }

  onTyping() {
    this.socket.emit('typing', {
      from: this.currentUser,
      to: this.currentChatUser
    });
  }

  addContact() {
    const contactUsername = prompt('Enter username to add:');
    if (!contactUsername) return;

    const token = this.authService.getToken();
    this.http.post(`${environment.apiUrl}/add-contact`, { contactUsername }, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).subscribe({
      next: () => this.loadContacts(),
      error: (err) => alert('Failed to add contact: ' + (err.error?.message || 'Unknown error'))
    });
  }

  deleteContact(contact: string) {
    if (!confirm(`Are you sure you want to delete ${contact} from contacts?`)) return;

    const token = this.authService.getToken();
    this.http.delete(`${environment.apiUrl}/contacts/${contact}`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).subscribe({
      next: () => {
        this.contacts = this.contacts.filter(c => c !== contact);
        if (this.currentChatUser === contact) {
          this.currentChatUser = '';
          this.messages = [];
        }
      },
      error: (err) => alert('Failed to delete contact: ' + (err.error?.message || 'Unknown error'))
    });
  }

  editMessage(index: number) {
    this.messages = this.messages.map((msg, i) => ({
      ...msg,
      isEditing: i === index ? true : false,
      editText: msg.text
    }));
  }

  saveEditedMessage(index: number) {
    const message = this.messages[index];
    if (!message.editText.trim()) return;

    this.socket.emit('edit-message', {
      _id: message._id,
      text: message.editText
    });

    this.messages[index].isEditing = false;
  }

  cancelEdit(index: number) {
    this.messages[index].isEditing = false;
  }

  deleteMessage(index: number) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    const message = this.messages[index];
    this.socket.emit('delete-message', { _id: message._id });
  }

  getLastMessagePreview(contact: string): string {
    const messages = this.messages.filter(msg =>
      (msg.from === contact && msg.to === this.currentUser) ||
      (msg.from === this.currentUser && msg.to === contact)
    );
    return messages.length > 0 ? messages[messages.length - 1].text : '';
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
