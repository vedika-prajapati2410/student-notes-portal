let idToken = null;
let pendingEmail = "";

const API = CONFIG.apiUrl;
const REGION = CONFIG.region;
const CLIENT_ID = CONFIG.clientId;

const $ = (id) => document.getElementById(id);

function message(text, type = "ok") {
  const box = $("msg");
  box.textContent = text;
  box.className = type;
}

function showCard(card) {
  ["loginCard", "signupCard", "confirmCard"].forEach(id =>
    $(id).classList.add("hidden")
  );
  $(card).classList.remove("hidden");
}

async function cognito(action, data) {
  const response = await fetch(
    `https://cognito-idp.${REGION}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`
      },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Authentication failed");
  return result;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${idToken}`
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Show signup and login forms
$("showSignup").onclick = () => showCard("signupCard");
$("showLogin1").onclick = () => showCard("loginCard");
$("showLogin2").onclick = () => showCard("loginCard");

// Sign up
$("signupBtn").onclick = async () => {
  try {
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;

    if (!email || !password) throw new Error("Enter email and password.");

    await cognito("SignUp", {
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }]
    });

    pendingEmail = email;
    showCard("confirmCard");
    message("Sign-up successful. Check your email for the verification code.");
  } catch (error) {
    message(error.message, "err");
  }
};

// Confirm email
$("confirmBtn").onclick = async () => {
  try {
    await cognito("ConfirmSignUp", {
      ClientId: CLIENT_ID,
      Username: pendingEmail,
      ConfirmationCode: $("confirmCode").value.trim()
    });

    message("Email verified! You can now log in.");
    showCard("loginCard");
    $("loginEmail").value = pendingEmail;
  } catch (error) {
    message(error.message, "err");
  }
};

// Login
$("loginBtn").onclick = async () => {
  try {
    const result = await cognito("InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: $("loginEmail").value.trim(),
        PASSWORD: $("loginPassword").value
      }
    });

    if (!result.AuthenticationResult) {
      throw new Error("Additional password setup is required for this account.");
    }

    idToken = result.AuthenticationResult.IdToken;
    $("authSection").classList.add("hidden");
    $("appSection").classList.remove("hidden");
    $("userBox").classList.remove("hidden");
    $("userEmail").textContent = $("loginEmail").value.trim();

    message("Login successful!");
    await loadNotes();
  } catch (error) {
    message(error.message, "err");
  }
};

// Logout
$("logoutBtn").onclick = () => {
  idToken = null;
  $("authSection").classList.remove("hidden");
  $("appSection").classList.add("hidden");
  $("userBox").classList.add("hidden");
  $("loginPassword").value = "";
  message("You have logged out.");
};

// Upload PDF
$("uploadBtn").onclick = async () => {
  try {
    const file = $("file").files[0];
    const title = $("title").value.trim();
    const subject = $("subject").value.trim();
    const semester = $("semester").value.trim();

    if (!file || !title || !subject) {
      throw new Error("Enter title, subject and select a PDF.");
    }

    if (file.type !== "application/pdf") {
      throw new Error("Please select a PDF file.");
    }

    message("Preparing upload...");

    const result = await api("/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, subject, semester })
    });

    const uploadResponse = await fetch(result.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error("PDF upload failed. Please try again.");
    }

    message("PDF uploaded successfully!");
    $("title").value = "";
    $("subject").value = "";
    $("semester").value = "";
    $("file").value = "";

    await loadNotes();
  } catch (error) {
    message(error.message, "err");
  }
};

// Load notes
async function loadNotes() {
  try {
    const result = await api("/notes");
    const search = $("search").value.toLowerCase();

    const notes = (result.notes || []).filter(note =>
      `${note.title} ${note.subject}`.toLowerCase().includes(search)
    );

    $("notesBody").innerHTML = "";

    if (notes.length === 0) {
      $("notesBody").innerHTML =
        '<tr><td colspan="5">No notes found.</td></tr>';
      return;
    }

    notes.forEach(note => {
      const row = document.createElement("tr");

      [note.title, note.subject, note.semester || "-", note.owner || "-"]
        .forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });

      const actionCell = document.createElement("td");
      const button = document.createElement("button");
      button.textContent = "Download";
      button.onclick = () => downloadNote(note.noteId);
      actionCell.appendChild(button);
      row.appendChild(actionCell);

      $("notesBody").appendChild(row);
    });
  } catch (error) {
    message(error.message, "err");
  }
}

// Download PDF
async function downloadNote(noteId) {
  try {
    const result = await api(`/notes/${encodeURIComponent(noteId)}/download`);
    window.open(result.downloadUrl, "_blank");
  } catch (error) {
    message(error.message, "err");
  }
}

$("searchBtn").onclick = loadNotes;
$("refreshBtn").onclick = () => {
  $("search").value = "";
  loadNotes();
};