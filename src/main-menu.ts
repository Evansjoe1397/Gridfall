import './main-menu.css';

function menuIcon(paths: string): string {
  return `<svg class="menu-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function mainMenuMarkup(): string {
  return `<div class="lobby-copy"><p class="eyebrow">TACTICAL ARENA</p><h1>GRIDFALL</h1></div>
    <div class="mode-grid">
      <button class="mode-card primary menu-hotseat" id="hotseat" type="button">${menuIcon('<path d="M7 5l18 22M25 5L7 27M4 22l6 6M22 28l6-6M5 4l6 2-4 5M27 4l-6 2 4 5"/>')}<span>LOCAL PLAY</span><strong>Hotseat duel</strong><i class="menu-arrow" aria-hidden="true">↗</i></button>
      <div class="mode-card online menu-online">${menuIcon('<circle cx="9" cy="9" r="4"/><circle cx="23" cy="9" r="4"/><path d="M2 24v-3a7 7 0 0114 0v3M16 24v-3a7 7 0 0114 0v3"/>')}<span>PRIVATE ROOM</span><strong>Multiplayer</strong><div class="menu-room-fields"><label>Room password<input id="password" maxlength="24" placeholder="Optional" /></label><label>Room ID<input id="roomId" maxlength="24" placeholder="Join an existing room" /></label></div><div class="menu-room-actions"><button id="createRoom" type="button">Create room</button><button id="joinRoom" type="button">Join by ID</button></div></div>
      <button class="mode-card primary character-archive-card menu-characters" id="openCharacterBrowser" type="button">${menuIcon('<path d="M10 5h12v9a6 6 0 01-12 0zM7 28v-3a9 9 0 0118 0v3M13 10h6"/>')}<span>THE ROSTER</span><strong>Characters</strong><i class="menu-arrow" aria-hidden="true">↗</i></button>
      <button class="mode-card primary menu-statistics" id="openStatistics" type="button">${menuIcon('<path d="M5 27h23M8 22v-7h4v7M16 22V9h4v13M24 22V4h4v18"/>')}<span>MATCH ARCHIVE</span><strong>Statistics</strong><i class="menu-arrow" aria-hidden="true">↗</i></button>
    </div>`;
}
