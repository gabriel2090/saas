; Asistente corto por usuario, sin pedir administrador (D-176, D-189).
; La casilla de la última página dice «Abrir al terminar».

!define MUI_FINISHPAGE_RUN_TEXT "Abrir al terminar"

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Pregunta al desinstalar si se borran la base y los respaldos (D-177, D-190).
; Una actualización llama al desinstalador con --updated: no se pregunta ni se borra.
; En silencio, /SD IDNO conserva los datos. La copia externa no se nombra aquí.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "¿Borrar también la base de datos y los respaldos de este usuario?$\r$\n$\r$\nSi elige Sí, se elimina la carpeta de datos de Inventario y Facturación. No se puede deshacer.$\r$\n$\r$\nLa carpeta de copia externa (USB u otra unidad) no se modifica.$\r$\n$\r$\nElija No para conservar los datos. Al instalar de nuevo se encuentran solos." \
      /SD IDNO IDYES borrarDatosApp IDNO conservarDatosApp
    borrarDatosApp:
      RMDir /r "$APPDATA\Inventario y Facturación"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
    conservarDatosApp:
  ${endIf}
!macroend
