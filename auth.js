/* =====================================================================
   auth.js — Supabase-backed authentication for the Tariff Book
   Requires (loaded before this file):
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="supabase-config.js"></script>
   ===================================================================== */

const SUPABASE_CONFIGURED =
  typeof window.supabase !== "undefined" &&
  typeof window.SUPABASE_URL === "string" &&
  typeof window.SUPABASE_ANON_KEY === "string" &&
  !window.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !window.SUPABASE_ANON_KEY.includes("YOUR-ANON");

const sb = SUPABASE_CONFIGURED
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

const MIN_PASSWORD_LENGTH = 8;
let currentProfile = null; // { id, email, fullName, role, approved }

/* ---------------------------------------------------------------- helpers */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showMessage(element, message, type = "info") {
  if (!element) return;
  element.textContent = message;
  element.className = `auth-message ${type}`;
}

function pageIs(name) {
  return window.location.pathname.endsWith(name) || window.location.pathname.includes(`/${name}`);
}

function redirectToMain() {
  window.location.href = "index.html";
}

function getCurrentUser() {
  return currentProfile;
}

function isAdminUser(user = currentProfile) {
  return Boolean(user && user.role === "admin" && user.approved);
}

function friendlyAuthError(error) {
  const text = (error && error.message ? error.message : "").toLowerCase();
  if (text.includes("invalid login")) return "Invalid email or password.";
  if (text.includes("email not confirmed")) return "Please confirm your email address first (check your inbox), then sign in.";
  if (text.includes("rate limit") || text.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
  if (text.includes("password")) return error.message;
  return "Something went wrong. Please try again.";
}

/* ------------------------------------------------------- session / profile */

async function loadCurrentProfile() {
  if (!sb) return null;
  const { data: sessionData } = await sb.auth.getSession();
  const session = sessionData && sessionData.session;
  if (!session) {
    currentProfile = null;
    return null;
  }

  const { data, error } = await sb
    .from("profiles")
    .select("id, email, full_name, role, approved")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !data) {
    currentProfile = null;
    return null;
  }

  currentProfile = {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    approved: data.approved,
  };
  return currentProfile;
}

async function signOutAndGoToLogin() {
  try {
    if (sb) await sb.auth.signOut();
  } catch (error) {
    console.warn("Sign-out problem", error);
  }
  currentProfile = null;
  window.location.href = "login.html";
}

/* ----------------------------------------------------------------- theme */

function broadcastThemeToFrames(isDark) {
  try {
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        frame.contentWindow?.postMessage({ type: "tariff-theme-change", isDark }, window.location.origin);
      } catch (error) {
        console.warn("Unable to broadcast theme to iframe", error);
      }
    });
  } catch (error) {
    console.warn("Unable to broadcast theme to frames", error);
  }
}

function applyTheme(isDark) {
  const body = document.body;
  if (!body) return;

  body.classList.toggle("dark-theme", isDark);
  body.setAttribute("data-theme", isDark ? "dark" : "light");
  broadcastThemeToFrames(isDark);

  const themeButton = document.getElementById("theme-toggle-button");
  if (themeButton) {
    themeButton.setAttribute("aria-checked", String(isDark));
    const label = themeButton.querySelector(".theme-toggle-label");
    if (label) label.textContent = `Dark mode: ${isDark ? "On" : "Off"}`;
  }

  try {
    localStorage.setItem("tariff-book-theme", isDark ? "dark" : "light");
  } catch (error) {
    console.warn("Unable to save theme preference", error);
  }
}

function initThemeToggle() {
  const themeButton = document.getElementById("theme-toggle-button");

  try {
    applyTheme(localStorage.getItem("tariff-book-theme") === "dark");
  } catch (error) {
    applyTheme(false);
  }

  if (!themeButton) return;
  themeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyTheme(!document.body.classList.contains("dark-theme"));
  });
}

/* ---------------------------------------------------------------- modals */

function getModalParts() {
  return {
    modal: document.getElementById("page-modal"),
    title: document.getElementById("contact-modal-title"),
    body: document.querySelector(".contact-modal-body"),
  };
}

function openInfoModal(action) {
  const { modal, title, body } = getModalParts();
  if (!modal || !title || !body) return;

  if (action === "contacts") {
    title.textContent = "Contact us";
    body.innerHTML = [
      '<p class="contact-item"><strong>Email:</strong> <a href="mailto:christoskatchomoza@gmail.com">christoskatchomoza@gmail.com</a></p>',
      '<p class="contact-item"><strong>Phone:</strong> <a href="tel:+265992593853">+265 992 593 853</a></p>',
    ].join("");
  } else if (action === "about") {
    title.textContent = "About";
    body.innerHTML = [
      '<p class="contact-item">This Customs & Excise Tariff Book was built to give traders, clearing agents, and customs officers a fast, reliable access to HS code classifications, duty rates, and cross-references — all in one searchable tool.</p>',
      '<p class="contact-item">It draws on EAC/COMESA tariff schedules and is designed to simplify what is normally a slow, manual lookup process.</p>',
      '<p class="contact-item">Developed by <strong>McDonald Christos Katchomoza</strong>, a Customs Officer with the Malawi Revenue Authority.</p>',
      '<p class="contact-item">Idea inspired by <strong>Lucia Antonio</strong>.</p>',
    ].join("");
  }
  modal.hidden = false;
}

function openDutyCalculatorModal() {
  const { modal, title, body } = getModalParts();
  if (!modal || !title || !body) return;

  title.textContent = "Duty calculator";
  body.innerHTML = `
    <div class="duty-calculator-modal-shell">
      <iframe class="duty-calculator-frame" src="duty-calculator.html" title="Duty calculator"></iframe>
    </div>
  `;
  modal.hidden = false;
}

/* --------------------------------------------------------- change password */

function openChangePasswordModal() {
  const { modal, title, body } = getModalParts();
  if (!modal || !title || !body || !currentProfile) return;

  title.textContent = "Change password";
  body.innerHTML = `
    <div class="admin-modal-section">
      <h3 class="section-title display">Change password</h3>
      <p class="auth-muted">Update the password for ${escapeHtml(currentProfile.fullName || "your account")}.</p>
      <form id="change-password-form" class="change-password-form">
        <input type="password" name="currentPassword" placeholder="Current password" autocomplete="current-password" required />
        <input type="password" name="newPassword" placeholder="New password (min ${MIN_PASSWORD_LENGTH} characters)" autocomplete="new-password" required />
        <input type="password" name="confirmPassword" placeholder="Confirm new password" autocomplete="new-password" required />
        <div class="pending-actions">
          <button type="submit" class="change-password-btn">Update password</button>
          <button type="button" class="ignore-btn" data-action="close-modal">Cancel</button>
        </div>
        <div id="change-password-message" class="auth-message"></div>
      </form>
    </div>
  `;

  const form = body.querySelector("#change-password-form");
  const messageElement = body.querySelector("#change-password-message");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = form.currentPassword.value;
    const newPassword = form.newPassword.value;
    const confirmedPassword = form.confirmPassword.value;

    if (!currentPassword || !newPassword || !confirmedPassword) {
      showMessage(messageElement, "Password fields cannot be empty.", "error");
      return;
    }
    if (newPassword !== confirmedPassword) {
      showMessage(messageElement, "New passwords do not match.", "error");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      showMessage(messageElement, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, "error");
      return;
    }

    // Re-check the current password before allowing a change.
    const { error: verifyError } = await sb.auth.signInWithPassword({
      email: currentProfile.email,
      password: currentPassword,
    });
    if (verifyError) {
      showMessage(messageElement, "Your current password is incorrect.", "error");
      return;
    }

    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) {
      showMessage(messageElement, friendlyAuthError(error), "error");
      return;
    }

    showMessage(messageElement, "Your password has been updated successfully.", "success");
    form.reset();
  });

  modal.hidden = false;
}

/* --------------------------------------------------------- admin functions */

async function fetchProfiles() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, full_name, role, approved, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function approveUser(id) {
  const { data, error } = await sb.from("profiles").update({ approved: true }).eq("id", id).select("id");
  if (error || !data || !data.length) throw error || new Error("Not permitted");
}

async function deleteUser(id) {
  const { error } = await sb.rpc("admin_delete_user", { target: id });
  if (error) throw error;
}

async function sendResetEmail(email) {
  const redirectTo = new URL("reset-password.html", window.location.href).href;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

function userRowHtml(user, mode) {
  const name = `${escapeHtml(user.full_name)} (${escapeHtml(user.email)})`;
  const id = escapeHtml(user.id);
  const email = escapeHtml(user.email);

  if (mode === "pending") {
    return `
      <div class="pending-user">
        <span>${name}</span>
        <div class="pending-actions">
          <button type="button" class="approve-btn" data-admin-action="approve" data-id="${id}">Approve</button>
          <button type="button" class="ignore-btn" data-admin-action="delete" data-id="${id}">Ignore</button>
        </div>
      </div>`;
  }

  return `
    <div class="pending-user">
      <div class="user-meta">
        <span>${name}</span>
        <span class="user-role">User</span>
      </div>
      <div class="pending-actions">
        <span class="status-pill">Approved</span>
        <button type="button" class="change-password-btn" data-admin-action="reset-email" data-email="${email}">Send reset email</button>
        <button type="button" class="ignore-btn remove-btn" data-admin-action="delete" data-id="${id}">Remove</button>
      </div>
    </div>`;
}

async function openAdminModal(mode, notice) {
  const { modal, title, body } = getModalParts();
  if (!modal || !title || !body) return;

  const titles = {
    "admin-approval": "Admin approval",
    "registered-users": "Registered users",
    "password-reset-requests": "Password resets",
  };
  title.textContent = titles[mode] || "Admin";
  modal.hidden = false;

  if (!isAdminUser()) {
    body.innerHTML = '<p class="auth-muted">You need admin access to view this section.</p>';
    return;
  }

  if (mode === "password-reset-requests") {
    body.innerHTML =
      '<p class="auth-muted">Password resets are now sent by email. Users can use “Forgot password?” on the sign-in page, or you can send a reset email from the Registered users list.</p>';
    return;
  }

  body.innerHTML = '<p class="auth-muted">Loading…</p>';

  let people;
  try {
    people = (await fetchProfiles()).filter((user) => user.role !== "admin");
  } catch (error) {
    console.error(error);
    body.innerHTML = '<p class="auth-muted">Could not load users. Please try again.</p>';
    return;
  }

  const pending = people.filter((user) => !user.approved);
  const approved = people.filter((user) => user.approved);
  const noticeHtml = notice ? `<p class="auth-message ${escapeHtml(notice.type)}">${escapeHtml(notice.text)}</p>` : "";

  if (mode === "registered-users") {
    body.innerHTML = `
      <div class="admin-modal-section">
        <h3 class="section-title display">Registered users</h3>
        ${noticeHtml}
        ${approved.length ? approved.map((user) => userRowHtml(user, "approved")).join("") : '<p class="auth-muted">No registered users yet.</p>'}
      </div>`;
  } else {
    body.innerHTML = `
      <div class="admin-modal-section">
        <h3 class="section-title display">Pending approvals</h3>
        ${noticeHtml}
        ${pending.length ? pending.map((user) => userRowHtml(user, "pending")).join("") : '<p class="auth-muted">No pending approvals.</p>'}
      </div>`;
  }

  body.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-admin-action");

      // Two-step confirmation for destructive actions (no browser pop-ups).
      if (action === "delete" && button.dataset.armed !== "1") {
        const original = button.textContent;
        button.dataset.armed = "1";
        button.textContent = "Confirm?";
        window.setTimeout(() => {
          button.dataset.armed = "";
          button.textContent = original;
        }, 3000);
        return;
      }

      button.disabled = true;
      try {
        if (action === "approve") {
          await approveUser(button.dataset.id);
          openAdminModal(mode, { type: "success", text: "User approved." });
        } else if (action === "delete") {
          await deleteUser(button.dataset.id);
          openAdminModal(mode, { type: "info", text: "User removed." });
        } else if (action === "reset-email") {
          await sendResetEmail(button.dataset.email);
          openAdminModal(mode, { type: "success", text: "Password reset email sent." });
        }
      } catch (error) {
        console.error(error);
        openAdminModal(mode, { type: "error", text: "That action failed. Please try again." });
      }
    });
  });
}

/* ------------------------------------------------- signed-in page chrome */

function setupModalClosing() {
  const modal = document.getElementById("page-modal");
  if (!modal) return;

  modal.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target === modal ||
      (target.closest && target.closest("#close-modal, [data-action='close-modal']"))
    ) {
      modal.hidden = true;
    }
  });
}

function setupFooterLinks() {
  document.querySelectorAll(".footer-link[data-action]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openInfoModal(link.getAttribute("data-action"));
    });
  });
}

function setupSignedInChrome() {
  const logoutButton = document.getElementById("logout-button");
  const welcomeLabel = document.getElementById("user-welcome");
  const menuToggle = document.getElementById("menu-toggle");
  const accountMenu = document.getElementById("account-menu");
  const menuDetails = document.getElementById("menu-details");
  const adminButtons = ["admin-approval-button", "registered-users-button"]
    .map((id) => document.getElementById(id));
  const resetRequestsButton = document.getElementById("password-reset-button");
  const changePasswordButton = document.getElementById("change-password-button");

  if (!logoutButton) return;

  if (!currentProfile || !currentProfile.approved) {
    [menuToggle, accountMenu, logoutButton, changePasswordButton].forEach((el) => {
      if (el) el.style.display = "none";
    });
    if (welcomeLabel) welcomeLabel.textContent = "";
    return;
  }

  const admin = isAdminUser();
  if (menuToggle) menuToggle.style.display = "inline-block";
  adminButtons.forEach((button) => {
    if (button) button.style.display = admin ? "block" : "none";
  });
  // Manual reset requests no longer exist: resets are emailed by Supabase.
  if (resetRequestsButton) resetRequestsButton.style.display = "none";
  if (welcomeLabel) welcomeLabel.textContent = `Welcome, ${currentProfile.fullName}`;

  logoutButton.addEventListener("click", signOutAndGoToLogin);

  if (changePasswordButton) {
    changePasswordButton.style.display = "inline-block";
    changePasswordButton.addEventListener("click", openChangePasswordModal);
  }

  const syncMenuState = () => {
    if (menuToggle) menuToggle.setAttribute("aria-expanded", String(Boolean(menuDetails && menuDetails.open)));
  };

  if (menuDetails) {
    menuDetails.addEventListener("toggle", syncMenuState);
    syncMenuState();
  }

  document.addEventListener("click", (event) => {
    if (!menuDetails || !menuDetails.open) return;
    if (!menuDetails.contains(event.target)) {
      menuDetails.open = false;
      syncMenuState();
    }
  });

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = item.getAttribute("data-action");
      if (menuDetails) {
        menuDetails.open = false;
        syncMenuState();
      }

      if (action === "theme-toggle") applyTheme(!document.body.classList.contains("dark-theme"));
      else if (action === "duty-calculator") openDutyCalculatorModal();
      else if (action === "contacts" || action === "about") openInfoModal(action);
      else if (action === "admin-approval") openAdminModal("admin-approval");
      else if (action === "registered-users") openAdminModal("registered-users");
      else if (action === "password-reset-requests") openAdminModal("password-reset-requests");
    });
  });
}

/* ------------------------------------------------- login / register page */

function initAuthPage() {
  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const authMessage = document.getElementById("auth-message");
  const forgotToggle = document.getElementById("forgot-password-toggle");
  const forgotSection = document.getElementById("forgot-password-section");
  const forgotSubmit = document.getElementById("forgot-password-submit");
  const resetEmailInput = document.getElementById("reset-email");

  if (!sb) {
    showMessage(authMessage, "Sign-in is not configured yet (missing Supabase settings).", "error");
    return;
  }

  if (currentProfile && currentProfile.approved && pageIs("login.html")) {
    redirectToMain();
    return;
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fullName = registerForm.fullName.value.trim();
      const email = registerForm.email.value.trim().toLowerCase();
      const password = registerForm.password.value;

      if (!fullName || !email || !password) {
        showMessage(authMessage, "Please complete all registration fields.", "error");
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        showMessage(authMessage, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, "error");
        return;
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: new URL("login.html", window.location.href).href,
        },
      });

      if (error) {
        showMessage(authMessage, friendlyAuthError(error), "error");
        return;
      }

      // If email confirmation is switched off, signUp logs the person in. Sign out again:
      // they still need admin approval.
      if (data && data.session) await sb.auth.signOut();

      registerForm.reset();
      showMessage(
        authMessage,
        "Registration submitted. If you receive a confirmation email, confirm it, then wait for admin approval.",
        "success"
      );
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = loginForm.email.value.trim().toLowerCase();
      const password = loginForm.password.value;

      if (!email || !password) {
        showMessage(authMessage, "Please enter your email and password.", "error");
        return;
      }

      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        showMessage(authMessage, friendlyAuthError(error), "error");
        return;
      }

      await loadCurrentProfile();
      if (!currentProfile || !currentProfile.approved) {
        await sb.auth.signOut();
        currentProfile = null;
        showMessage(authMessage, "Your account is still pending admin approval.", "error");
        return;
      }

      showMessage(authMessage, "Login successful. Redirecting...", "success");
      window.setTimeout(redirectToMain, 400);
    });
  }

  if (forgotToggle && forgotSection) {
    forgotToggle.addEventListener("click", () => {
      forgotSection.hidden = !forgotSection.hidden;
      if (!forgotSection.hidden && resetEmailInput) resetEmailInput.focus();
    });
  }

  if (forgotSubmit) {
    forgotSubmit.addEventListener("click", async () => {
      const email = (resetEmailInput ? resetEmailInput.value : "").trim().toLowerCase();
      if (!email) {
        showMessage(authMessage, "Please enter your email address.", "error");
        return;
      }

      try {
        await sendResetEmail(email);
      } catch (error) {
        console.warn("Reset email error", error);
      }
      // Same answer whether or not the account exists, so emails cannot be probed.
      showMessage(authMessage, "If an account exists for that email, a reset link has been sent.", "success");
      if (forgotSection) forgotSection.hidden = true;
      if (resetEmailInput) resetEmailInput.value = "";
    });
  }
}

/* ---------------------------------------------------------- page guarding */

function protectProtectedPage() {
  // This is a convenience redirect. The real protection is row-level security in Supabase.
  if (!currentProfile || !currentProfile.approved) {
    window.location.replace("login.html");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initThemeToggle();
  setupModalClosing();
  setupFooterLinks();

  await loadCurrentProfile();

  if (pageIs("login.html") || pageIs("register.html")) {
    initAuthPage();
    return;
  }

  if (!sb) {
    window.location.replace("login.html");
    return;
  }

  protectProtectedPage();
  setupSignedInChrome();

  // Keep this tab in step if the person signs out in another tab.
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") window.location.replace("login.html");
  });
});
