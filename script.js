// Theme toggle
const body = document.body;
const themeSwitch = document.getElementById("themeSwitch");

function setTheme(theme) {
  body.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  themeSwitch.setAttribute("aria-checked", String(isDark));
  localStorage.setItem("theme", theme);
}

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);

themeSwitch.addEventListener("click", () => {
  const current = body.getAttribute("data-theme") || "light";
  setTheme(current === "light" ? "dark" : "light");
});

themeSwitch.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    themeSwitch.click();
  }
});

// Mobile menu
const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");
menuBtn.addEventListener("click", () => {
  mobileMenu.classList.toggle("open");
});
mobileMenu.querySelectorAll("a").forEach((a) => {
  a.addEventListener("click", () => mobileMenu.classList.remove("open"));
});

// FAQ accordion
document.querySelectorAll(".qa").forEach((qa) => {
  const btn = qa.querySelector(".qbtn");
  btn.addEventListener("click", () => {
    // close others (optional; comment out if you want multiple open)
    document.querySelectorAll(".qa.open").forEach((x) => {
      if (x !== qa) x.classList.remove("open");
    });
    qa.classList.toggle("open");
  });
});

// Button actions (wire to endpoints)
const go = (url) => (window.location.href = url);

document.getElementById("registerBtn").addEventListener("click", () => {
  // TODO: replace with registration URL
  window.open(
    "https://docs.google.com/forms/d/e/1FAIpQLSfffOTnJ0p6FYR05EPWm3oxTa4XoGVlu5CtpXqM6sBqD4Hekg/viewform?usp=dialog",
    "_blank"
  );
});
// Schedule
document.getElementById("scheduleBtn").addEventListener("click", () => {
  const modal = document.getElementById("scheduleModal");
  const modalContainer = document.getElementById("scheduleModalContainer");

  if (!modal || !modalContainer) {
    console.error("Schedule modal markup missing in HTML");
    return;
  }

  if (typeof window.initSchedule !== "function") {
    console.error("initSchedule not found. Load schedule.js before script.js");
    return;
  }
  // Open modal
  modal.classList.add("open");

  // Render schedule INSIDE modal
  window.initSchedule("scheduleModalContainer");
});
document.getElementById("closeSchedule").addEventListener("click", () => {
  document.getElementById("scheduleModal").classList.remove("open");
});

document
  .querySelector("#scheduleModal .modal-backdrop")
  .addEventListener("click", () => {
    document.getElementById("scheduleModal").classList.remove("open");
  });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("scheduleModal").classList.remove("open");
  }
});

document.getElementById("rulesLink").addEventListener("click", (e) => {
  // Keeps anchor behavior, but you can also open PDF here
  // e.g. go('/rules.pdf')
});

// Map
document.getElementById("directionsBtn").addEventListener("click", () => {
  const maps = "https://maps.app.goo.gl/4YZPUqTBNyjCGgee7";
  window.open(maps, "_blank");
});

// Newsletter
document
  .getElementById("newsletterForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();

    // TODO: Post to your backend, Mailchimp, Brevo, etc.
    // Example:
    // await fetch('/api/subscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email})})

    alert("Subscribed (mock). Wire this form to your email platform.");
    e.target.reset();
  });

// Year
document.getElementById("year").textContent = new Date().getFullYear();
