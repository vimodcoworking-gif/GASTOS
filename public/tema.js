// Se carga antes que la página para aplicar el tema guardado sin parpadeo. Por defecto, modo oscuro.
(function () {
  var tema = 'oscuro';
  try {
    tema = localStorage.getItem('tema') || 'oscuro';
  } catch (e) {
    // Almacenamiento bloqueado: se queda el modo claro.
  }
  document.documentElement.dataset.tema = tema === 'oscuro' ? 'oscuro' : 'claro';
})();
