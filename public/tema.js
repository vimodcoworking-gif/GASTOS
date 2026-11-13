// Se carga antes que la página para aplicar el tema guardado sin parpadeo. Por defecto, modo claro.
(function () {
  var tema = 'claro';
  try {
    tema = localStorage.getItem('tema') || 'claro';
  } catch (e) {
    // Almacenamiento bloqueado: se queda el modo claro.
  }
  document.documentElement.dataset.tema = tema === 'oscuro' ? 'oscuro' : 'claro';
})();
