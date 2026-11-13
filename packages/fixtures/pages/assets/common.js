// Shared by the fixtures. Submitting is intercepted: nothing leaves the page.
// The visible #result text and the data-submissions attribute are PAGE-OWNED readouts for humans and tests of the
// fixtures themselves. A real verifier must never trust markers a web page can write (security invariant 10).
(function () {
  let submissions = 0;
  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submissions += 1;
      document.body.dataset.submissions = String(submissions);
      var out = document.getElementById("result");
      if (out) {
        var data = new FormData(form);
        var keys = Array.from(data.keys()).filter(function (k) { return !/pass|secret|otp/i.test(k); });
        out.textContent = "Form received (fixture). Submissions: " + submissions + ". Fields: " + keys.join(", ");
      }
    });
  });
})();
