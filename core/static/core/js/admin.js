document.addEventListener('DOMContentLoaded', function () {
    if (typeof API_BASE_URL === 'undefined' || typeof API_ENTITIES_DATA === 'undefined') {
        console.error('API_BASE_URL or API_ENTITIES_DATA is not defined. Ensure they are set in the HTML template.');
        alert('Configuration error: API_BASE_URL or API_ENTITIES_DATA missing. Check console.');
        return;
    }

    const crudModalElement = document.getElementById('crudModal');
    const crudModal = crudModalElement ? new bootstrap.Modal(crudModalElement) : null;
    const crudModalLabel = document.getElementById('crudModalLabel');
    const crudModalBody = document.getElementById('crudModalBody');
    const crudModalSaveButton = document.getElementById('crudModalSaveButton');

    let currentActionContext = {
        config: null,
        displayName: null,
        action: null,
        entityId: null
    };

    document.querySelectorAll('.crud-action').forEach(button => {
        button.addEventListener('click', async function () {
            const entityDisplayName = this.dataset.entityName;
            const entityConfig = API_ENTITIES_DATA[entityDisplayName];

            if (!entityConfig || !entityConfig.endpoints || !entityConfig.api_path_key || !entityConfig.id_field_path_param_name) {
                console.error(`Configuration not found or incomplete for entity: ${entityDisplayName}`, entityConfig);
                const tempResultsContainerId = entityDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const tempResultsContainer = document.getElementById(`results-${tempResultsContainerId}`);
                if (tempResultsContainer) {
                    tempResultsContainer.innerHTML = `<div class="alert alert-danger mt-2">Configuration error for ${entityDisplayName}. Check console.</div>`;
                } else {
                    alert(`Configuration error for ${entityDisplayName}. Check console.`);
                }
                return;
            }

            currentActionContext = {
                config: entityConfig,
                displayName: entityDisplayName,
                action: this.dataset.action,
                entityId: null
            };
            
            const resultsContainerIdSlug = entityDisplayName.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^\w\s-]/g, '') 
                .replace(/\s+/g, '-')
                .replace(/--+/g, '-')
                .replace(/^-+|-+$/g, '');


            const resultsContainer = document.getElementById(`results-${resultsContainerIdSlug}`);
            
            if (crudModalSaveButton) crudModalSaveButton.style.display = 'none';
            
            if (resultsContainer) {
                 resultsContainer.innerHTML = '<div class="d-flex justify-content-center mt-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Cargando...</span></div></div>';
            }

            let url;
            let method = 'GET';

            try {
                switch (currentActionContext.action) {
                    case 'getAll':
                        url = `${API_BASE_URL}/${currentActionContext.config.endpoints.getAll}/`;
                        method = 'GET';
                        const responseGetAll = await fetch(url, { method: method });
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

                    case 'getById':
                        const idFieldPathParamNameGet = currentActionContext.config.id_field_path_param_name;
                        const idGet = prompt(`Ingrese el ID para ${currentActionContext.displayName} (${idFieldPathParamNameGet || 'ID'}):`);
                        if (idGet) {
                            currentActionContext.entityId = idGet;
                            let pathTemplateGet = currentActionContext.config.endpoints.getById;
                            if (!pathTemplateGet) throw new Error (`Endpoint 'getById' not configured for ${currentActionContext.displayName}`);
                            url = `${API_BASE_URL}/${pathTemplateGet.replace(`{${idFieldPathParamNameGet}}`, idGet)}`;
                            method = 'GET';
                            
                            const responseGetId = await fetch(url, { method: method });
                            if (!responseGetId.ok) throw new Error(`Error ${responseGetId.status}: ${await responseGetId.text()}`);
                            const dataId = await responseGetId.json();
                            if(crudModalLabel) crudModalLabel.textContent = `Detalle ${currentActionContext.displayName} - ID: ${idGet}`;
                            if(crudModalBody) crudModalBody.innerHTML = `<pre>${JSON.stringify(dataId, null, 2)}</pre>`;
                            if(crudModalSaveButton) crudModalSaveButton.style.display = 'none';
                            if(crudModal) crudModal.show();
                        }
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'create':
                        url = `${API_BASE_URL}/${currentActionContext.config.endpoints.create}/`;
                        method = 'POST';
                        if(crudModalLabel) crudModalLabel.textContent = `Crear Nuevo ${currentActionContext.displayName}`;
                        if(crudModalBody) crudModalBody.innerHTML = generateFormForEntity(currentActionContext.config.api_path_key, {}, false);
                        if(crudModalSaveButton) crudModalSaveButton.style.display = 'block';
                        if(crudModalSaveButton) crudModalSaveButton.textContent = 'Crear';
                        if(crudModalSaveButton) crudModalSaveButton.className = 'btn btn-success';
                        if(crudModalSaveButton) crudModalSaveButton.onclick = () => handleFormSubmit();
                        if(crudModal) crudModal.show();
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'update':
                        const idFieldPathParamNamePut = currentActionContext.config.id_field_path_param_name;
                        const idPut = prompt(`Ingrese el ID para actualizar ${currentActionContext.displayName} (${idFieldPathParamNamePut || 'ID'}):`);
                        if (idPut) {
                            currentActionContext.entityId = idPut;
                            method = 'PUT';

                            let pathTemplatePutFetch = currentActionContext.config.endpoints.getById;
                             if (!pathTemplatePutFetch && currentActionContext.config.endpoints.update) {
                                pathTemplatePutFetch = currentActionContext.config.endpoints.update.substring(0, currentActionContext.config.endpoints.update.lastIndexOf('/'));
                            }
                            if (!pathTemplatePutFetch) throw new Error(`Endpoint to fetch data for update (getById or similar) not configured for ${currentActionContext.displayName}`);
                            
                            const fetchUrlPut = `${API_BASE_URL}/${pathTemplatePutFetch.replace(`{${idFieldPathParamNamePut}}`, idPut)}`;
                            const fetchResponse = await fetch(fetchUrlPut);
                            if (!fetchResponse.ok) throw new Error(`Error obteniendo datos para actualizar ${fetchResponse.status}: ${await fetchResponse.text()}`);
                            const currentData = await fetchResponse.json();

                            if(crudModalLabel) crudModalLabel.textContent = `Actualizar ${currentActionContext.displayName} - ID: ${idPut}`;
                            if(crudModalBody) crudModalBody.innerHTML = generateFormForEntity(currentActionContext.config.api_path_key, currentData, false);
                            if(crudModalSaveButton) crudModalSaveButton.style.display = 'block';
                            if(crudModalSaveButton) crudModalSaveButton.textContent = 'Actualizar';
                            if(crudModalSaveButton) crudModalSaveButton.className = 'btn btn-warning';
                            if(crudModalSaveButton) crudModalSaveButton.onclick = () => handleFormSubmit();
                            if(crudModal) crudModal.show();
                        }
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'patch':
                        const idFieldPathParamNamePatch = currentActionContext.config.id_field_path_param_name;
                        const idPatch = prompt(`Ingrese el ID para actualizar parcialmente ${currentActionContext.displayName} (${idFieldPathParamNamePatch || 'ID'}):`);
                        if (idPatch) {
                            currentActionContext.entityId = idPatch;
                            method = 'PATCH';

                            let pathTemplatePatchFetch = currentActionContext.config.endpoints.getById;
                            if (!pathTemplatePatchFetch && currentActionContext.config.endpoints.patch) {
                                pathTemplatePatchFetch = currentActionContext.config.endpoints.patch.substring(0, currentActionContext.config.endpoints.patch.lastIndexOf('/'));
                            }
                            if (!pathTemplatePatchFetch) throw new Error(`Endpoint to fetch data for patch (getById or similar) not configured for ${currentActionContext.displayName}`);

                            const fetchUrlPatch = `${API_BASE_URL}/${pathTemplatePatchFetch.replace(`{${idFieldPathParamNamePatch}}`, idPatch)}`;
                            const fetchResponsePatch = await fetch(fetchUrlPatch);
                            if (!fetchResponsePatch.ok) throw new Error(`Error obteniendo datos para PATCH ${fetchResponsePatch.status}: ${await fetchResponsePatch.text()}`);
                            const currentDataPatch = await fetchResponsePatch.json();

                            if(crudModalLabel) crudModalLabel.textContent = `Actualizar Parcialmente ${currentActionContext.displayName} - ID: ${idPatch}`;
                            if(crudModalBody) crudModalBody.innerHTML = generateFormForEntity(currentActionContext.config.api_path_key, currentDataPatch, true);
                            if(crudModalSaveButton) crudModalSaveButton.style.display = 'block';
                            if(crudModalSaveButton) crudModalSaveButton.textContent = 'Actualizar Parcialmente';
                            if(crudModalSaveButton) crudModalSaveButton.className = 'btn btn-secondary';
                            if(crudModalSaveButton) crudModalSaveButton.onclick = () => handleFormSubmit();
                            if(crudModal) crudModal.show();
                        }
                        if(resultsContainer) resultsContainer.innerHTML = '';
                        break;

                    case 'delete':
                        const idFieldPathParamNameDelete = currentActionContext.config.id_field_path_param_name;
                        const idDelete = prompt(`Ingrese el ID para eliminar ${currentActionContext.displayName} (${idFieldPathParamNameDelete || 'ID'}):`);
                        if (idDelete) {
                            currentActionContext.entityId = idDelete;
                            showConfirmationModal(`¿Está seguro de que desea eliminar ${currentActionContext.displayName} con ID ${idDelete}?`, async () => {
                                if(resultsContainer) resultsContainer.innerHTML = '<div class="d-flex justify-content-center mt-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Eliminando...</span></div></div>';
                                try {
                                    let pathTemplateDelete = currentActionContext.config.endpoints.delete;
                                    if (!pathTemplateDelete) throw new Error (`Endpoint 'delete' not configured for ${currentActionContext.displayName}`);
                                    const deleteUrl = `${API_BASE_URL}/${pathTemplateDelete.replace(`{${idFieldPathParamNameDelete}}`, currentActionContext.entityId)}`;
                                    
                                    const responseDelete = await fetch(deleteUrl, { method: 'DELETE' });
                                    if (!responseDelete.ok) {
                                        const errorText = await responseDelete.text();
                                        let errorDetail = errorText;
                                        try { const errorJson = JSON.parse(errorText); errorDetail = errorJson.detail || JSON.stringify(errorJson); } catch (e) {}
                                        throw new Error(`Error ${responseDelete.status}: ${errorDetail}`);
                                    }
                                    let deleteMsg = `Elemento de ${currentActionContext.displayName} (ID: ${currentActionContext.entityId}) eliminado con éxito.`;
                                    if (responseDelete.status !== 204 && responseDelete.body) {
                                        try { 
                                            const responseBodyText = await responseDelete.text();
                                            if (responseBodyText) {
                                                const deletedData = JSON.parse(responseBodyText); 
                                                deleteMsg += `\n<pre>${JSON.stringify(deletedData, null, 2)}</pre>`; 
                                            }
                                        } catch (e) { }
                                    }
                                    if(resultsContainer) resultsContainer.innerHTML = `<div class="alert alert-success mt-2">${deleteMsg}</div>`;
                                    
                                    const getAllButton = document.querySelector(`.crud-action[data-entity-name="${currentActionContext.displayName}"][data-action="getAll"]`);
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
                
                if (['create', 'update', 'patch', 'getById'].includes(currentActionContext.action) && crudModalBody) {
                    if(crudModalLabel && !crudModalLabel.textContent.toLowerCase().includes('error')) {
                    }
                    crudModalBody.innerHTML = errorMsg;
                    if(crudModalSaveButton) crudModalSaveButton.style.display = 'none';
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
        
        const originalSaveButton = document.getElementById('crudModalSaveButton');
        let confirmButton = originalSaveButton;

        const newConfirmButton = originalSaveButton.cloneNode(true);
        originalSaveButton.parentNode.replaceChild(newConfirmButton, originalSaveButton);
        confirmButton = newConfirmButton;
        
        confirmButton.textContent = 'Confirmar';
        confirmButton.className = 'btn btn-danger';
        confirmButton.style.display = 'block';
        
        const cancelButton = crudModalElement.querySelector('.btn-outline-secondary[data-bs-dismiss="modal"]');

        confirmButton.onclick = () => {
            onConfirm();
            crudModal.hide();
        };
        
        const handleCancel = () => {
            if (onCancel) onCancel();
            confirmButton.onclick = null; 
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

    function getFormFieldsForEntity(entityApiKey, isPatch = false) {
        const fields = {
            'ciudad': [
                {name: 'id_ciudad', label: 'ID Ciudad', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Ciudad', type: 'text', required: !isPatch, placeholder: 'Ej: Santiago'}
            ],
            'cargo': [
                {name: 'id_cargo', label: 'ID Cargo', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 10 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Cargo', type: 'text', required: !isPatch, placeholder: 'Ej: Vendedor'}
            ],
            'categoria': [
                {name: 'id_categoria', label: 'ID Categoría', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 100 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Categoría', type: 'text', required: !isPatch, placeholder: 'Ej: Herramientas Manuales'}
            ],
            'estado_pedido': [
                {name: 'id_estado_pedido', label: 'ID Estado Pedido', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Estado', type: 'text', required: !isPatch, placeholder: 'Ej: Pendiente'}
            ],
            'tipo_transaccion': [
                {name: 'id_tipo_transaccion', label: 'ID Tipo Transacción', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'descripcion', label: 'Descripción Transacción', type: 'text', required: !isPatch, placeholder: 'Ej: Venta Crédito'}
            ],
            'sucursal': [
                {name: 'id_sucursal', label: 'ID Sucursal', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'nombre_sucursal', label: 'Nombre Sucursal', type: 'text', required: !isPatch, placeholder: 'Ej: Ferremas Central'},
                {name: 'direccion', label: 'Dirección', type: 'text', required: false, placeholder: 'Ej: Av. Principal 123'},
                {name: 'id_ciudad', label: 'ID Ciudad (Existente)', type: 'number', required: !isPatch, placeholder: 'Ej: 1'}
            ],
            'empleado': [
                {name: 'id_empleado', label: 'ID Empleado', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 101 (Requerido al crear)'},
                {name: 'rut', label: 'RUT (sin puntos, con guión)', type: 'text', required: !isPatch, placeholder: 'Ej: 12345678-9'},
                {name: 'p_nombre', label: 'Primer Nombre', type: 'text', required: !isPatch},
                {name: 's_nombre', label: 'Segundo Nombre', type: 'text', required: false},
                {name: 'p_apellido', label: 'Primer Apellido', type: 'text', required: !isPatch},
                {name: 's_apellido', label: 'Segundo Apellido', type: 'text', required: false},
                {name: 'correo', label: 'Email', type: 'email', required: !isPatch},
                {name: 'telefono', label: 'Teléfono', type: 'tel', required: false, placeholder: 'Ej: +56912345678'},
                {name: 'salario', label: 'Salario', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'clave_hash', label: 'Clave (Hash)', type: 'text', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Contraseña encriptada (solo crear)'},
                {name: 'id_cargo', label: 'ID Cargo (Existente)', type: 'number', required: false, placeholder: 'Ej: 10'},
                {name: 'id_sucursal', label: 'ID Sucursal (Existente)', type: 'number', required: false, placeholder: 'Ej: 1'},
                {name: 'activo', label: 'Activo', type: 'select', options: [{value: 'S', text: 'Sí'}, {value: 'N', text: 'No'}], required: !isPatch, value: 'S' }
            ],
            'cliente': [
                {name: 'id_cliente', label: 'ID Cliente', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 1001 (Requerido al crear)'},
                {name: 'p_nombre', label: 'Primer Nombre', type: 'text', required: !isPatch},
                {name: 's_nombre', label: 'Segundo Nombre', type: 'text', required: false},
                {name: 'p_apellido', label: 'Primer Apellido', type: 'text', required: !isPatch},
                {name: 's_apellido', label: 'Segundo Apellido', type: 'text', required: false},
                {name: 'correo', label: 'Email', type: 'email', required: !isPatch},
                {name: 'telefono', label: 'Teléfono', type: 'tel', required: false},
                {name: 'clave_hash', label: 'Clave (Hash)', type: 'text', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Contraseña encriptada (solo crear)'},
                {name: 'activo', label: 'Activo', type: 'select', options: [{value: 'S', text: 'Sí'}, {value: 'N', text: 'No'}], required: !isPatch, value: 'S' }
            ],
            'productos': [
                {name: 'id_producto', label: 'ID Producto', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Ej: 1 (Requerido al crear)'},
                {name: 'nombre', label: 'Nombre Producto', type: 'text', required: !isPatch},
                {name: 'marca', label: 'Marca', type: 'text', required: false},
                {name: 'descripcion_detallada', label: 'Descripción Detallada', type: 'textarea', required: false},
                {name: 'precio', label: 'Precio', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'id_categoria', label: 'ID Categoría (Existente)', type: 'number', required: false, placeholder: 'Ej: 100'},
                {name: 'imagen_url', label: 'URL Imagen', type: 'url', required: false, placeholder: 'https://ejemplo.com/imagen.jpg'},
            ],
            'stock_sucursal': [
                {name: 'id_stock_sucursal', label: 'ID Stock', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'id_producto', label: 'ID Producto (Existente)', type: 'number', required: !isPatch},
                {name: 'id_sucursal', label: 'ID Sucursal (Existente)', type: 'number', required: !isPatch},
                {name: 'cantidad', label: 'Cantidad', type: 'number', min: '0', required: !isPatch},
                {name: 'ubicacion_bodega', label: 'Ubicación Bodega', type: 'text', required: false},
            ],
            'log_actividad_inventario': [
                {name: 'id_log', label: 'ID Log', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
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
                {name: 'id_pedido', label: 'ID Pedido', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'fecha_pedido_str', label: 'Fecha Pedido (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'},
                {name: 'id_cliente', label: 'ID Cliente', type: 'number', required: false},
                {name: 'id_empleado_vendedor', label: 'ID Empleado Vendedor', type: 'number', required: false},
                {name: 'id_sucursal_origen', label: 'ID Sucursal Origen', type: 'number', required: false},
                {name: 'id_estado_pedido', label: 'ID Estado Pedido', type: 'number', required: !isPatch},
                {name: 'total_pedido', label: 'Total Pedido', type: 'number', step: '0.01', min: '0', required: !isPatch, value: '0.00'}
            ],
            'detalle_pedido': [
                {name: 'id_detalle_pedido', label: 'ID Detalle', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'id_pedido', label: 'ID Pedido (Existente)', type: 'number', required: !isPatch},
                {name: 'id_producto', label: 'ID Producto (Existente)', type: 'number', required: !isPatch},
                {name: 'cantidad', label: 'Cantidad', type: 'number', min: '1', required: !isPatch},
                {name: 'precio_unitario_venta', label: 'Precio Unitario Venta', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'subtotal', label: 'Subtotal', type: 'number', step: '0.01', min: '0', required: !isPatch}
            ],
            'factura': [
                {name: 'id_factura', label: 'ID Factura', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'numero_factura', label: 'Número Factura', type: 'text', required: !isPatch},
                {name: 'id_pedido', label: 'ID Pedido (Existente)', type: 'number', required: !isPatch},
                {name: 'fecha_emision_str', label: 'Fecha Emisión (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'},
                {name: 'total_neto', label: 'Total Neto', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'iva', label: 'IVA', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'total_con_iva', label: 'Total con IVA', type: 'number', step: '0.01', min: '0', required: !isPatch}
            ],
            'transaccion': [
                {name: 'id_transaccion', label: 'ID Transacción', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'id_factura', label: 'ID Factura (Existente)', type: 'number', required: !isPatch},
                {name: 'id_tipo_transaccion', label: 'ID Tipo Transacción (Existente)', type: 'number', required: !isPatch},
                {name: 'monto_pagado', label: 'Monto Pagado', type: 'number', step: '0.01', min: '0', required: !isPatch},
                {name: 'fecha_transaccion_str', label: 'Fecha Transacción (YYYY-MM-DD)', type: 'date', required: false, placeholder: 'Opcional, por defecto hoy'},
                {name: 'referencia_pago', label: 'Referencia de Pago', type: 'text', required: false},
                {name: 'id_empleado_cajero', label: 'ID Empleado Cajero', type: 'number', required: false}
            ],
            'reporte_ventas': [
                {name: 'id_reporte_ventas', label: 'ID Reporte Ventas', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'fecha_generacion_str', label: 'Fecha Generación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'periodo_inicio_str', label: 'Periodo Inicio (YYYY-MM-DD)', type: 'date', required: false},
                {name: 'periodo_fin_str', label: 'Periodo Fin (YYYY-MM-DD)', type: 'date', required: false},
                {name: 'total_ventas_calculado', label: 'Total Ventas Calculado', type: 'number', step: '0.01', required: !isPatch},
                {name: 'id_sucursal', label: 'ID Sucursal', type: 'number', required: false}
            ],
             'reporte_desempenio': [
                {name: 'id_reporte_desempenio', label: 'ID Reporte Desempeño', type: 'number', required: !isPatch && currentActionContext.action === 'create', placeholder: 'Requerido al crear'},
                {name: 'id_empleado', label: 'ID Empleado', type: 'number', required: !isPatch},
                {name: 'fecha_generacion_str', label: 'Fecha Generación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'periodo_evaluacion_inicio_str', label: 'Inicio Periodo Evaluación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'periodo_evaluacion_fin_str', label: 'Fin Periodo Evaluación (YYYY-MM-DD)', type: 'date', required: !isPatch},
                {name: 'datos_evaluacion', label: 'Datos Evaluación (Texto/JSON)', type: 'textarea', required: !isPatch}
            ],
        };
        return fields[entityApiKey] || [];
    }

    function generateFormForEntity(entityApiKey, initialData = {}, isPatch = false) {
        const fields = getFormFieldsForEntity(entityApiKey, isPatch);
        if (fields.length === 0) {
            return '<p>Definición de formulario no encontrada para esta entidad. Por favor, complete <code>getFormFieldsForEntity</code> en el script o verifique <code>api_path_key</code> en la configuración de la entidad.</p>';
        }

        let formHtml = `<form id="crudEntityForm" class="needs-validation" novalidate>`;
        fields.forEach(field => {
            let value = initialData && initialData[field.name] !== undefined && initialData[field.name] !== null ? initialData[field.name] : (field.value !== undefined ? field.value : '');
            
            if (field.type === 'date' && typeof value === 'string' && value.includes('T')) {
                value = value.split('T')[0];
            }
            if (field.type === 'select' && value !== null && value !== undefined) {
                value = String(value);
            }

            const required = isPatch ? (field.required === true) : (field.required !== false);

            formHtml += `<div class="mb-3">`;
            formHtml += `<label for="field-${field.name}" class="form-label">${field.label}${required ? ' <span class="text-danger">*</span>' : ''}</label>`;
            
            if (field.type === 'textarea') {
                formHtml += `<textarea class="form-control" id="field-${field.name}" name="${field.name}" ${required ? 'required' : ''} rows="${field.rows || 3}">${value}</textarea>`;
            } else if (field.type === 'select' && field.options) {
                formHtml += `<select class="form-select" id="field-${field.name}" name="${field.name}" ${required ? 'required' : ''}>`;
                if (!required || field.placeholder) {
                    formHtml += `<option value="" ${value === '' ? 'selected' : ''}>${field.placeholder || 'Seleccione...'}</option>`;
                }
                field.options.forEach(opt => {
                    formHtml += `<option value="${opt.value}" ${value === String(opt.value) ? 'selected' : ''}>${opt.text}</option>`;
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
        const { config, action, entityId, displayName } = currentActionContext;
        const form = document.getElementById('crudEntityForm');
        
        if (!form || (form.checkValidity && !form.checkValidity())) {
            if(form && form.classList) form.classList.add('was-validated');
            const firstInvalidField = form.querySelector(':invalid');
            if (firstInvalidField && firstInvalidField.focus) {
                firstInvalidField.focus();
            } else if (crudModalBody && crudModalBody.firstChild && crudModalBody.firstChild.focus) {
                 crudModalBody.firstChild.focus();
            }
            if (crudModalBody) crudModalBody.scrollTop = 0;
            return;
        }

        const formData = new FormData(form);
        const dataPayload = {};
        const isPatch = action === 'patch';
        const fieldsForEntity = getFormFieldsForEntity(config.api_path_key, isPatch);

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
                        console.warn(`Valor no numérico para campo ${field.name}: ${value}. Será omitido si no es requerido.`);
                        includeField = isPatch ? false : field.required !== false; 
                        processedValue = null;
                    }
                }
                else if (field.type === 'date' && value) {
                    processedValue = value;
                }
            } else {
                if (isPatch) {
                    includeField = false;
                } else {
                    if (field.required !== false) {
                        includeField = true;
                        processedValue = (field.type === 'number') ? null : ""; 
                    } else {
                        includeField = false;
                    }
                }
            }
            
            if (!isPatch && field.type === 'number' && field.required !== false && (value === "" || value === null) ) {
                dataPayload[field.name] = null;
                includeField = true;
            }


            if (includeField) {
                dataPayload[field.name] = processedValue;
            }
        });
        
        let operationUrl;
        let httpMethod;
        const idFieldPathParam = config.id_field_path_param_name;

        switch(action) {
            case 'create':
                operationUrl = `${API_BASE_URL}/${config.endpoints.create}/`;
                httpMethod = 'POST';
                break;
            case 'update':
                if (!entityId) throw new Error("Entity ID is missing for update operation.");
                operationUrl = `${API_BASE_URL}/${config.endpoints.update.replace(`{${idFieldPathParam}}`, entityId)}`;
                httpMethod = 'PUT';
                break;
            case 'patch':
                if (!entityId) throw new Error("Entity ID is missing for patch operation.");
                operationUrl = `${API_BASE_URL}/${config.endpoints.patch.replace(`{${idFieldPathParam}}`, entityId)}`;
                httpMethod = 'PATCH';
                break;
            default:
                throw new Error(`Unsupported form submission action: ${action}`);
        }
        
        if(crudModalBody) crudModalBody.innerHTML = '<div class="d-flex justify-content-center mt-3"><div class="spinner-border" role="status"><span class="visually-hidden">Procesando...</span></div></div>';

        try {
            const response = await fetch(operationUrl, {
                method: httpMethod,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataPayload)
            });

            const responseText = await response.text();
            if (!response.ok) {
                let errorDetail = responseText;
                try { 
                    const errorJson = JSON.parse(responseText); 
                    errorDetail = errorJson.detail || JSON.stringify(errorJson); 
                } catch (e) { }
                throw new Error(`Error ${response.status}: ${errorDetail}`);
            }
            
            let responseDataMessage = `${httpMethod} exitoso.`;
            let responseData = null;
            if (responseText) {
                try { 
                    responseData = JSON.parse(responseText); 
                    responseDataMessage = responseData.Mensaje || responseData.message || responseDataMessage;
                } catch (e) { 
                    if (response.status !== 204) responseDataMessage = responseText;
                 }
            }


            if(crudModalBody) crudModalBody.innerHTML = `<div class="alert alert-success">Éxito: ${action.toUpperCase()} en ${displayName}</div>
                ${responseData ? `<pre>${JSON.stringify(responseData, null, 2)}</pre>` : responseDataMessage }`;
            if(crudModalSaveButton) crudModalSaveButton.style.display = 'none';
            
            const getAllButton = document.querySelector(`.crud-action[data-entity-name="${displayName}"][data-action="getAll"]`);
            if (getAllButton) {
                 setTimeout(() => {
                    getAllButton.click();
                    if(crudModal) crudModal.hide();
                }, 1200);
            } else {
                if(crudModal) setTimeout(() => crudModal.hide(), 1500);
            }

        } catch (error) {
            console.error(`Error en ${httpMethod} ${config.api_path_key}:`, error, dataPayload);
            if(crudModalBody) {
                crudModalBody.innerHTML = `<div class="alert alert-danger mb-3">Error: ${error.message}</div>` + generateFormForEntity(config.api_path_key, dataPayload, isPatch);
                const newForm = document.getElementById('crudEntityForm');
                if (newForm && newForm.classList) newForm.classList.add('was-validated');
            }
        }
    }
});
