// Animated counters
function animateCounters() {
  const counters = document.querySelectorAll(".stat-number")

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const counter = entry.target
          const target = Number.parseInt(counter.getAttribute("data-target"))
          const duration = 2000 // 2 seconds
          const increment = target / (duration / 16)
          let current = 0

          const updateCounter = () => {
            current += increment
            if (current < target) {
              counter.textContent = Math.floor(current).toLocaleString()
              requestAnimationFrame(updateCounter)
            } else {
              counter.textContent = target.toLocaleString()
            }
          }

          updateCounter()
          observer.unobserve(counter)
        }
      })
    },
    { threshold: 0.5 },
  )

  counters.forEach((counter) => observer.observe(counter))
}

// Search functionality
function initializeSearch() {
  const searchInput = document.querySelector(".search-input")

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim()
      if (query) {
        // Redirect to map with search query
        window.location.href = `/map?search=${encodeURIComponent(query)}`
      }
    }
  })
}

// Smooth scrolling for anchor links
function initializeSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault()
      const target = document.querySelector(this.getAttribute("href"))
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }
    })
  })
}

// Initialize all functionality
document.addEventListener("DOMContentLoaded", () => {
  animateCounters()
  initializeSearch()
  initializeSmoothScrolling()
})

// Add loading animation
window.addEventListener("load", () => {
  document.body.classList.add("loaded")
})
