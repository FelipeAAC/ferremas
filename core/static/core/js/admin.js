
document.addEventListener('DOMContentLoaded', function () {
    const API_BASE_URL = 'http://127.0.0.1:8001';

    const crudModalElement = document.getElementById('crudModal');
    const crudModal = crudModalElement ? new bootstrap.Modal(crudModalElement) : null;
    const crudModalLabel = document.getElementById('crudModalLabel');
    const crudModalBody = document.getElementById('crudModalBody');
    const crudModalSaveButton = document.getElementById('crudModalSaveButton');

    let currentActionContext = {
        entityPath: null,
        entityName: null,
        action: null,
        idField: null,
        entityId: null
    };

    document.querySelectorAll('.crud-action').forEach(button => {
        button.addEventListener('click', async function () {
            currentActionContext = {
                entityPath: this.dataset.entityPath,
                entityName: this.dataset.entityName,
                action: this.dataset.action,
                idField: this.dataset.idField,
                entityId: null
            };

            const resultsContainer = document.getElementById(`results-${currentActionContext.entityPath}`);
            
            if (crudModalSaveButton) crudModalSaveButton.style.display = 'none';
            
            if (resultsContainer) {
                 resultsContainer.innerHTML = '<div class="d-flex justify-content-center mt-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Cargando...</span></div></div>';
            }

            try {
                switch (currentActionContext.action) {
                    case 'get-all':
                        const responseGetAll = await fetch(`${API_BASE_URL}/${currentActionContext.entityPath}/`);
                        if (!responseGetAll.ok) throw new Error(`Error ${responseGetAll.status}: ${await responseGetAll.text()}`);
                        const dataAll = await responseGetAll.json();

                        if (resultsContainer) {
                            if (Array.isArray(dataAll) && dataAll.length > 0) {
                                let tableHtml = '<div class="table-responsive mt-2"><table class="table table-striped table-bordered table-hover table-sm">';
                                tableHtml += '<thead class="table-dark"><tr>';
                                const headers = Object.keys(dataAll[0]);
                                headers.forEach(header => {
                                    tableHtml += `<th>${header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`;
                                });
                                tableHtml += '</tr></thead>';
                                tableHtml += '<tbody>';
                                dataAll.forEach(item => {
                                    tableHtml += '<tr>';
                                    headers.forEach(header => {
                                        let cellValue = item[header];
                                        if (typeof cellValue === 'object' && cellValue !== null) {
                                            cellValue = JSON.stringify(cellValue);
                                        } else if (typeof cellValue === 'boolean') {
                                            cellValue = cellValue ? 'Sí' : 'No';
                                        } else if (cellValue === null || cellValue === undefined) {
                                            cellValue = '';
                                        }
                                        tableHtml += `<td>${cellValue}</td>`;
                                    });
                                    tableHtml += '</tr>';
                                });
                                tableHtml += '</tbody></table></div>';
                                resultsContainer.innerHTML = tableHtml;
                            } else if (Array.isArray(dataAll) && dataAll.length === 0) {
                                resultsContainer.innerHTML = '<div class="alert alert-info mt-2">No hay datos para mostrar.</div>';
                            } else {
                                resultsContainer.innerHTML = `<div class="alert alert-warning mt-2">Respuesta inesperada (no es un array de datos):</div><pre>${JSON.stringify(dataAll, null, 2)}</pre>`;
                            }
                        }
                        break;

                    case 'get-id':
                        const idGet = prompt(`Ingrese el ID para ${currentActionContext.entityName} (${currentActionContext.idField || 'ID'}):`);
                        if (idGet) {
                            const responseGetId = await fetch(`${API_BASE_URL}/${currentActionContext.entityPath}/${idGet}`);
                            if (!responseGetId.ok) throw new Error(`Error ${responseGetId.status}: ${await responseGetId.text()}`);
                            const dataId = await responseGetId.json();
                            if(crudModalLabel) crudModalLabel.textContent = `Detalle ${currentActionContext.entityName} - ID: ${idGet}`;
                            if(crudModalBody) crudModalBody.innerHTML = `<pre>${JSON.stringify(dataId, null, 2)}</pre>`;
                            if(crudModal) crudModal.show();
                        }
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'post':
                        if(crudModalLabel) crudModalLabel.textContent = `Crear Nuevo ${currentActionContext.entityName}`;
                        if(crudModalBody) crudModalBody.innerHTML = generateFormForEntity(currentActionContext.entityPath, {}, false);
                        if(crudModalSaveButton) crudModalSaveButton.style.display = 'block';
                        if(crudModalSaveButton) crudModalSaveButton.onclick = () => handleFormSubmit();
                        if(crudModal) crudModal.show();
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'put':
                        const idPut = prompt(`Ingrese el ID para actualizar ${currentActionContext.entityName} (${currentActionContext.idField || 'ID'}):`);
                        if (idPut) {
                            currentActionContext.entityId = idPut;
                            const fetchResponse = await fetch(`${API_BASE_URL}/${currentActionContext.entityPath}/${idPut}`);
                            if (!fetchResponse.ok) throw new Error(`Error obteniendo datos para PUT ${fetchResponse.status}: ${await fetchResponse.text()}`);
                            const currentData = await fetchResponse.json();

                            if(crudModalLabel) crudModalLabel.textContent = `Actualizar ${currentActionContext.entityName} - ID: ${idPut}`;
                            if(crudModalBody) crudModalBody.innerHTML = generateFormForEntity(currentActionContext.entityPath, currentData, false);
                            if(crudModalSaveButton) crudModalSaveButton.style.display = 'block';
                            if(crudModalSaveButton) crudModalSaveButton.onclick = () => handleFormSubmit();
                            if(crudModal) crudModal.show();
                        }
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'patch':
                        const idPatch = prompt(`Ingrese el ID para actualizar parcialmente ${currentActionContext.entityName} (${currentActionContext.idField || 'ID'}):`);
                        if (idPatch) {
                            currentActionContext.entityId = idPatch;
                            const fetchResponsePatch = await fetch(`${API_BASE_URL}/${currentActionContext.entityPath}/${idPatch}`);
                            if (!fetchResponsePatch.ok) throw new Error(`Error obteniendo datos para PATCH ${fetchResponsePatch.status}: ${await fetchResponsePatch.text()}`);
                            const currentDataPatch = await fetchResponsePatch.json();

                            if(crudModalLabel) crudModalLabel.textContent = `Actualizar Parcialmente ${currentActionContext.entityName} - ID: ${idPatch}`;
                            if(crudModalBody) crudModalBody.innerHTML = generateFormForEntity(currentActionContext.entityPath, currentDataPatch, true);
                            if(crudModalSaveButton) crudModalSaveButton.style.display = 'block';
                            if(crudModalSaveButton) crudModalSaveButton.onclick = () => handleFormSubmit();
                            if(crudModal) crudModal.show();
                        }
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'delete':
                        const idDelete = prompt(`Ingrese el ID para eliminar ${currentActionContext.entityName} (${currentActionContext.idField || 'ID'}):`);
                        if (idDelete) {
                            showConfirmationModal(`¿Está seguro de que desea eliminar ${currentActionContext.entityName} con ID ${idDelete}?`, async () => {
                                if(resultsContainer) resultsContainer.innerHTML = '<div class="d-flex justify-content-center mt-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Eliminando...</span></div></div>';
                                try {
                                    const responseDelete = await fetch(`${API_BASE_URL}/${currentActionContext.entityPath}/${idDelete}`, { method: 'DELETE' });
                                    if (!responseDelete.ok) {
                                        const errorText = await responseDelete.text();
                                        let errorDetail = errorText;
                                        try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.detail || JSON.stringify(errorJson); } catch (e) { /* no es json */ }
                                        throw new Error(`Error ${responseDelete.status}: ${errorDetail}`);
                                    }
                                    let deleteMsg = `Elemento de ${currentActionContext.entityName} (ID: ${idDelete}) eliminado con éxito.`;
                                    if (responseDelete.status !== 204 && responseDelete.body) {
                                        try { const deletedData = await responseDelete.json(); deleteMsg += `\n<pre>${JSON.stringify(deletedData, null, 2)}</pre>`; } catch (e) { /* no es json */ }
                                    }
                                    if(resultsContainer) resultsContainer.innerHTML = `<div class="alert alert-success mt-2">${deleteMsg}</div>`;
                                    
                                    const getAllButton = document.querySelector(`.crud-action[data-entity-path="${currentActionContext.entityPath}"][data-action="get-all"]`);
                                    if (getAllButton) setTimeout(() => getAllButton.click(), 500);

                                } catch (error) {
                                    console.error('Error en operación DELETE:', error);
                                    if(resultsContainer) resultsContainer.innerHTML = `<div class="alert alert-danger mt-2">Error al eliminar: ${error.message}</div>`;
                                }
                            }, () => {
                                if(resultsContainer) resultsContainer.innerHTML = '<div class="alert alert-info mt-2">Eliminación cancelada.</div>';
                            });
                        } else {
                           if(resultsContainer) resultsContainer.innerHTML = '';
                        }
                        break;

                    default:
                        if(resultsContainer) resultsContainer.innerHTML = `<div class="alert alert-warning mt-2">Acción no implementada: ${currentActionContext.action}</div>`;
                }
            } catch (error) {
                console.error('Error en operación CRUD:', error);
                const errorMsg = `<div class="alert alert-danger mt-2">Error: ${error.message}</div>`;
                if(resultsContainer) resultsContainer.innerHTML = errorMsg;
                if (['post', 'put', 'patch', 'get-id'].includes(currentActionContext.action) && crudModalBody) {
                    crudModalBody.innerHTML = errorMsg;
                    if (crudModal && !crudModalElement.classList.contains('show')) {
                         crudModal.show();
                    }
                }
            }
        });
    });

    function showConfirmationModal(message, onConfirm, onCancel) {
        if (!crudModal || !crudModalLabel || !crudModalBody || !crudModalSaveButton) {
            if (confirm(message)) {
                onConfirm();
            } else {
                if (onCancel) onCancel();
            }
            return;
        }

        crudModalLabel.textContent = 'Confirmación';
        crudModalBody.innerHTML = `<p>${message}</p>`;
        crudModalSaveButton.textContent = 'Confirmar';
        crudModalSaveButton.className = 'btn btn-danger';
        crudModalSaveButton.style.display = 'block';
        
        const cancelButton = crudModalElement.querySelector('.btn-secondary[data-bs-dismiss="modal"]');

        const newSaveButton = crudModalSaveButton.cloneNode(true);
        crudModalSaveButton.parentNode.replaceChild(newSaveButton, crudModalSaveButton);

        newSaveButton.onclick = () => {
            onConfirm();
            crudModal.hide();
        };
        
        const handleCancel = () => {
            if (onCancel) onCancel();
            if (cancelButton) cancelButton.removeEventListener('click', handleCancel);
            crudModalElement.removeEventListener('hidden.bs.modal', handleCancelOnDismiss);
        };
        const handleCancelOnDismiss = (event) => {
            if (event.target === crudModalElement) {
                 handleCancel();
            }
        };

        if (cancelButton) cancelButton.addEventListener('click', handleCancel, { once: true });
        crudModalElement.addEventListener('hidden.bs.modal', handleCancelOnDismiss, { once: true });

        crudModal.show();
    }


    function getFormFieldsForEntity(entityPath, isPatch = false) {
        const fields = {
            'ciudad': [
                {name: 'id_ciudad', label: 'ID Ciudad', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Ciudad', type: 'text', required: !isPatch, placeholder: 'Ej: Santiago'}
            ],
            'cargo': [
                {name: 'id_cargo', label: 'ID Cargo', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 10 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Cargo', type: 'text', required: !isPatch, placeholder: 'Ej: Vendedor'}
            ],
            'categoria': [
                {name: 'id_categoria', label: 'ID Categoría', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 100 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Categoría', type: 'text', required: !isPatch, placeholder: 'Ej: Herramientas Manuales'}
            ],
            'estado_pedido': [
                {name: 'id_estado_pedido', label: 'ID Estado Pedido', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Estado', type: 'text', required: !isPatch, placeholder: 'Ej: Pendiente'}
            ],
            'tipo_transaccion': [
                {name: 'id_tipo_transaccion', label: 'ID Tipo Transacción', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Transacción', type: 'text', required: !isPatch, placeholder: 'Ej: Venta Crédito'}
            ],
            'sucursal': [
                {name: 'id_sucursal', label: 'ID Sucursal', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'nombre_sucursal', label: 'Nombre Sucursal', type: 'text', required: !isPatch, placeholder: 'Ej: Ferremas Central'},
                {name: 'direccion', label: 'Dirección', type: 'text', required: false, placeholder: 'Ej: Av. Principal 123'},
                {name: 'id_ciudad', label: 'ID Ciudad (Existente)', type: 'number', required: !isPatch, placeholder: 'Ej: 1'}
            ],
            'empleado': [
                {name: 'id_empleado', label: 'ID Empleado', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 101 (Requerido al crear)'},
                {name: 'rut', label: 'RUT (sin puntos, con guión)', type: 'text', required: !isPatch, placeholder: 'Ej: 12345678-9'},
                {name: 'p_nombre', label: 'Primer Nombre', type: 'text', required: !isPatch},
                {name: 's_nombre', label: 'Segundo Nombre', type: 'text', required: false},
                {name: 'p_apellido', label: 'Primer Apellido', type: 'text', required: !isPatch},
                {name: 's_apellido', label: 'Segundo Apellido', type: 'text', required: false},
                {name: 'correo', label: 'Email', type: 'email', required: !isPatch},
                {name: 'telefono', label: 'Teléfono', type: 'tel', required: false, placeholder: 'Ej: +56912345678'},
                {name: 'salario', label: 'Salario', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'clave_hash', label: 'Clave (Hash)', type: 'text', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Contraseña encriptada (solo crear)'},
                {name: 'id_cargo', label: 'ID Cargo (Existente)', type: 'number', required: false, placeholder: 'Ej: 10'},
                {name: 'id_sucursal', label: 'ID Sucursal (Existente)', type: 'number', required: false, placeholder: 'Ej: 1'},
                {name: 'activo', label: 'Activo (S/N)', type: 'text', required: !isPatch, placeholder: 'S o N', value: 'S' } // 'value' aquí es para el form, no para el payload inicial
            ],
            'cliente': [
                {name: 'id_cliente', label: 'ID Cliente', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 1001 (Requerido al crear)'},
                {name: 'p_nombre', label: 'Primer Nombre', type: 'text', required: !isPatch},
                {name: 's_nombre', label: 'Segundo Nombre', type: 'text', required: false},
                {name: 'p_apellido', label: 'Primer Apellido', type: 'text', required: !isPatch},
                {name: 's_apellido', label: 'Segundo Apellido', type: 'text', required: false},
                {name: 'correo', label: 'Email', type: 'email', required: !isPatch},
                {name: 'telefono', label: 'Teléfono', type: 'tel', required: false},
                {name: 'clave_hash', label: 'Clave (Hash)', type: 'text', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Contraseña encriptada (solo crear)'},
                {name: 'activo', label: 'Activo (S/N)', type: 'text', required: !isPatch, placeholder: 'S o N', value: 'S' }
            ],
            'productos': [
                {name: 'id_producto', label: 'ID Producto', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'nombre', label: 'Nombre Producto', type: 'text', required: !isPatch},
                {name: 'marca', label: 'Marca', type: 'text', required: false},
                {name: 'descripcion_detallada', label: 'Descripción Detallada', type: 'textarea', required: false},
                {name: 'precio', label: 'Precio', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'id_categoria', label: 'ID Categoría (Existente)', type: 'number', required: false, placeholder: 'Ej: 100'},
                {name: 'imagen_url', label: 'URL Imagen', type: 'url', required: false, placeholder: 'https://ejemplo.com/imagen.jpg'},
            ],
            'stock_sucursal': [
                {name: 'id_stock_sucursal', label: 'ID Stock', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'id_producto', label: 'ID Producto (Existente)', type: 'number', required: !isPatch},
                {name: 'id_sucursal', label: 'ID Sucursal (Existente)', type: 'number', required: !isPatch},
                {name: 'cantidad', label: 'Cantidad', type: 'number', min: '0', required: !isPatch},
                {name: 'ubicacion_bodega', label: 'Ubicación Bodega', type: 'text', required: false},
            ],
            'log_actividad_inventario': [
                {name: 'id_log', label: 'ID Log', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'tipo_actividad', label: 'Tipo Actividad', type: 'text', required: !isPatch, placeholder: 'Ej: ENTRADA, SALIDA, AJUSTE'},
                {name: 'id_producto', label: 'ID Producto', type: 'number', required: false},
                {name: 'id_sucursal', label: 'ID Sucursal', type: 'number', required: false},
                {name: 'cantidad_afectada', label: 'Cantidad Afectada', type: 'number', required: false},
                {name: 'stock_anterior', label: 'Stock Anterior', type: 'number', required: false},
                {name: 'stock_nuevo', label: 'Stock Nuevo', type: 'number', required: false},
                {name: 'fecha_actividad', label: 'Fecha Actividad (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'},
                {name: 'id_empleado_responsable', label: 'ID Empleado Responsable', type: 'number', required: false},
                {name: 'notas', label: 'Notas', type: 'textarea', required: false}
            ],
            'pedido': [
                {name: 'id_pedido', label: 'ID Pedido', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'fecha_pedido_str', label: 'Fecha Pedido (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'}, // Nótese el _str para el input
                {name: 'id_cliente', label: 'ID Cliente', type: 'number', required: false},
                {name: 'id_empleado_vendedor', label: 'ID Empleado Vendedor', type: 'number', required: false},
                {name: 'id_sucursal_origen', label: 'ID Sucursal Origen', type: 'number', required: false},
                {name: 'id_estado_pedido', label: 'ID Estado Pedido', type: 'number', required: !isPatch},
                {name: 'total_pedido', label: 'Total Pedido', type: 'number', step: '0.01', min: '0', required: !isPatch, value: '0.00'}
            ],
            'detalle_pedido': [
                {name: 'id_detalle_pedido', label: 'ID Detalle', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'id_pedido', label: 'ID Pedido (Existente)', type: 'number', required: !isPatch},
                {name: 'id_producto', label: 'ID Producto (Existente)', type: 'number', required: !isPatch},
                {name: 'cantidad', label: 'Cantidad', type: 'number', min: '1', required: !isPatch},
                {name: 'precio_unitario_venta', label: 'Precio Unitario Venta', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'subtotal', label: 'Subtotal', type: 'number', step: '0.01', min: '0', required: !isPatch}
            ],
            'factura': [
                {name: 'id_factura', label: 'ID Factura', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'numero_factura', label: 'Número Factura', type: 'text', required: !isPatch},
                {name: 'id_pedido', label: 'ID Pedido (Existente)', type: 'number', required: !isPatch},
                {name: 'fecha_emision_str', label: 'Fecha Emisión (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'},
                {name: 'total_neto', label: 'Total Neto', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'iva', label: 'IVA', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'total_con_iva', label: 'Total con IVA', type: 'number', step: '0.01', min: '0', required: !isPatch}
            ],
            'transaccion': [
                {name: 'id_transaccion', label: 'ID Transacción', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'id_factura', label: 'ID Factura (Existente)', type: 'number', required: !isPatch},
                {name: 'id_tipo_transaccion', label: 'ID Tipo Transacción (Existente)', type: 'number', required: !isPatch},
                {name: 'monto_pagado', label: 'Monto Pagado', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'fecha_transaccion_str', label: 'Fecha Transacción (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'},
                {name: 'referencia_pago', label: 'Referencia de Pago', type: 'text', required: false},
                {name: 'id_empleado_cajero', label: 'ID Empleado Cajero', type: 'number', required: false}
            ],
            'reporte_ventas': [
                {name: 'id_reporte_ventas', label: 'ID Reporte Ventas', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'fecha_generacion_str', label: 'Fecha Generación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'periodo_inicio_str', label: 'Periodo Inicio (YYYY-MM-DD)', type: 'date', required: false},
                {name: 'periodo_fin_str', label: 'Periodo Fin (YYYY-MM-DD)', type: 'date', required: false},
                {name: 'total_ventas_calculado', label: 'Total Ventas Calculado', type: 'number', step: '0.01', required: !isPatch},
                {name: 'id_sucursal', label: 'ID Sucursal', type: 'number', required: false}
            ],
             'reporte_desempenio': [
                {name: 'id_reporte_desempenio', label: 'ID Reporte Desempeño', type: 'number', required: !isPatch && currentActionContext.action === 'post', placeholder: 'Requerido al crear'},
                {name: 'id_empleado', label: 'ID Empleado', type: 'number', required: !isPatch},
                {name: 'fecha_generacion_str', label: 'Fecha Generación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'periodo_evaluacion_inicio_str', label: 'Inicio Periodo Evaluación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'periodo_evaluacion_fin_str', label: 'Fin Periodo Evaluación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'datos_evaluacion', label: 'Datos Evaluación (Texto/JSON)', type: 'textarea', required: !isPatch}
            ],
        };
        return fields[entityPath] || [];
    }

    function generateFormForEntity(entityPath, initialData = {}, isPatch = false) {
        const fields = getFormFieldsForEntity(entityPath, isPatch);
        if (fields.length === 0) {
            return '<p>Definición de formulario no encontrada para esta entidad. Por favor, complete <code>getFormFieldsForEntity</code> en el script.</p>';
        }

        let formHtml = `<form id="crudEntityForm" class="needs-validation" novalidate>`;
        fields.forEach(field => {
            let value = initialData && initialData[field.name] !== undefined && initialData[field.name] !== null ? initialData[field.name] : (field.value !== undefined ? field.value : '');
            
            if (field.type === 'date' && typeof value === 'string' && value.includes('T')) {
                value = value.split('T')[0];
            }

            const required = isPatch ? (field.required === true) : (field.required !== false);

            formHtml += `<div class="mb-3">`;
            formHtml += `<label for="field-${field.name}" class="form-label">${field.label}${required ? ' <span class="text-danger">*</span>' : ''}</label>`;
            
            if (field.type === 'textarea') {
                formHtml += `<textarea class="form-control" id="field-${field.name}" name="${field.name}" ${required ? 'required' : ''} rows="${field.rows || 3}">${value}</textarea>`;
            } else if (field.type === 'select' && field.options) {
                formHtml += `<select class="form-select" id="field-${field.name}" name="${field.name}" ${required ? 'required' : ''}>`;
                if (!required || field.placeholder) {
                    formHtml += `<option value="" ${String(value) === '' ? 'selected' : ''}>${field.placeholder || 'Seleccione...'}</option>`;
                }
                field.options.forEach(opt => {
                    formHtml += `<option value="${opt.value}" ${String(value) === String(opt.value) ? 'selected' : ''}>${opt.text}</option>`;
                });
                formHtml += `</select>`;
            } else if (field.type === 'checkbox') {
                const checked = initialData && initialData[field.name] !== undefined ? initialData[field.name] : (field.checked || false);
                formHtml += `<div class="form-check">`;
                formHtml += `<input class="form-check-input" type="checkbox" id="field-${field.name}" name="${field.name}" value="${field.valueForCheckbox || 'true'}" ${checked ? 'checked' : ''} ${required ? 'required' : ''}>`;
                formHtml += `</div>`;
            }
            else {
                formHtml += `<input type="${field.type || 'text'}" class="form-control" id="field-${field.name}" name="${field.name}" value="${value}" `;
                if (field.step !== undefined) formHtml += `step="${field.step}" `;
                if (field.min !== undefined) formHtml += `min="${field.min}" `;
                if (field.max !== undefined) formHtml += `max="${field.max}" `;
                if (field.placeholder) formHtml += `placeholder="${field.placeholder}" `;
                if (required) formHtml += `required `;
                formHtml += `>`;
            }
            if (required && field.type !== 'checkbox') {
                 formHtml += `<div class="invalid-feedback">Este campo es obligatorio.</div>`;
            }
            formHtml += `</div>`;
        });
        formHtml += `</form>`;
        return formHtml;
    }

    async function handleFormSubmit() {
        const { entityPath, action, entityId } = currentActionContext;
        const form = document.getElementById('crudEntityForm');
        
        if (!form || (form.checkValidity && !form.checkValidity())) {
            if(form && form.classList) form.classList.add('was-validated');
            if (crudModalBody && crudModalBody.firstChild && crudModalBody.firstChild.focus) {
                 crudModalBody.firstChild.focus();
            }
            if (crudModalBody) crudModalBody.scrollTop = 0;
            return;
        }

        const formData = new FormData(form);
        const dataPayload = {};
        const isPatch = action === 'patch';
        const fieldsForEntity = getFormFieldsForEntity(entityPath, isPatch);

        fieldsForEntity.forEach(field => {
            let value = formData.get(field.name);
            let includeField = false;
            let processedValue = value;

            if (field.type === 'checkbox') {
                processedValue = formData.has(field.name);
                includeField = true;
            } else if (value !== null && value !== "") {
                includeField = true;
                if (field.type === 'number') {
                    processedValue = parseFloat(value);
                    if (isNaN(processedValue)) {
                        console.warn(`Valor no numérico para campo ${field.name}: ${value}`);
                        includeField = false; 
                    }
                }
            } else if (!isPatch && field.required) {
                 includeField = true;
                 processedValue = (field.type === 'number') ? null : value;
            } else if (isPatch && (value === null || value === "")) {
                includeField = false;
            }


            if (includeField) {
                dataPayload[field.name] = processedValue;
            }
        });
        
        const url = entityId ? `${API_BASE_URL}/${entityPath}/${entityId}` : `${API_BASE_URL}/${entityPath}/`;
        const method = action.toUpperCase();
        
        if(crudModalBody) crudModalBody.innerHTML = '<div class="d-flex justify-content-center mt-3"><div class="spinner-border" role="status"><span class="visually-hidden">Procesando...</span></div></div>';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataPayload)
            });

            const responseText = await response.text();
            if (!response.ok) {
                let errorDetail = responseText;
                try { const errorJson = JSON.parse(responseText); errorDetail = errorJson.detail || JSON.stringify(errorJson); } catch (e) { /* No es JSON */ }
                throw new Error(`Error ${response.status}: ${errorDetail}`);
            }
            
            let responseData = { message: `${method} exitoso.` };
            if (responseText) {
                try { responseData = JSON.parse(responseText); } catch (e) { /* No es JSON */ }
            }

            if(crudModalBody) crudModalBody.innerHTML = `<div class="alert alert-success">Éxito: ${action.toUpperCase()} en ${entityPath}</div><pre>${JSON.stringify(responseData, null, 2)}</pre>`;
            if(crudModalSaveButton) crudModalSaveButton.style.display = 'none';
            
            const getAllButton = document.querySelector(`.crud-action[data-entity-path="${entityPath}"][data-action="get-all"]`);
            if (getAllButton) {
                 setTimeout(() => {
                    getAllButton.click();
                    if(crudModal) crudModal.hide();
                }, 1200);
            } else {
                if(crudModal) setTimeout(() => crudModal.hide(), 1500);
            }

        } catch (error) {
            console.error(`Error en ${method} ${entityPath}:`, error, dataPayload);
            if(crudModalBody) {
                crudModalBody.innerHTML = `<div class="alert alert-danger mb-3">Error: ${error.message}</div>` + generateFormForEntity(entityPath, dataPayload, isPatch);
                const newForm = document.getElementById('crudEntityForm');
                if (newForm && newForm.classList) newForm.classList.add('was-validated');
            }
        }
    }
});
