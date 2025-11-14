let currentMinQuantity = 0;

ymaps.ready(function () {

    fetch('open.json')
        .then(response => response.json())
        .then(obj => {

            console.log(obj);

            const searchControls = new ymaps.control.SearchControl({
                options: {
                    float: 'right',
                    noPlacemark: true
                }
            });

            // Инициализация карты
            const myMap = new ymaps.Map("map", {
                center: [55.76, 37.64], // Начальные координаты
                zoom: 7, // Начальный уровень зума
                controls: [searchControls]
            });

            // Удаление ненужных элементов управления
            const removeControls = [
                'geolocationControl',
                'trafficControl',
                'fullscreenControl',
                'zoomControl',
                'rulerControl',
                'typeSelector'
            ];

            const clearTheMap = myMap => {
                removeControls.forEach(controls => myMap.controls.remove(controls));
            };

            clearTheMap(myMap);

            // Создание ObjectManager для кластеризации
            const objectManager = new ymaps.ObjectManager({
                clusterize: true,
                clusterIconLayout: "default#pieChart"
            });

            // Массив координат для расчета границ
            let minLatitude = Infinity, maxLatitude = -Infinity;
            let minLongitude = Infinity, maxLongitude = -Infinity;

            // Для фильтра по количеству ДК
            let maxQuantity = 0;

            // Обрабатываем объекты и инвертируем координаты
            obj.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    const [longitude, latitude] = feature.geometry.coordinates;
                    feature.geometry.coordinates = [latitude, longitude];  // Меняем долготу и широту местами

                    // Границы карты
                    minLatitude = Math.min(minLatitude, latitude);
                    maxLatitude = Math.max(maxLatitude, latitude);
                    minLongitude = Math.min(minLongitude, longitude);
                    maxLongitude = Math.max(maxLongitude, longitude);
                }

                // Берём quantity для вычисления максимума
                if (feature.properties && typeof feature.properties.quantity === 'number') {
                    const q = feature.properties.quantity;
                    if (q > maxQuantity) {
                        maxQuantity = q;
                    }
                }
            });

            // Очистка данных в ObjectManager перед добавлением новых объектов
            objectManager.removeAll();

            // Добавляем все объекты в objectManager
            objectManager.add(obj);

            // Добавляем objectManager на карту
            myMap.geoObjects.add(objectManager);

            // Устанавливаем границы карты вручную
            if (minLatitude !== Infinity && maxLatitude !== -Infinity &&
                minLongitude !== Infinity && maxLongitude !== -Infinity) {
                const bounds = [
                    [minLatitude, minLongitude],  // Низшая точка
                    [maxLatitude, maxLongitude]   // Высшая точка
                ];
                myMap.setBounds(bounds, {
                    checkZoomRange: true  // Устанавливаем зум в зависимости от объема данных
                });
            }

            // Инициализируем UI фильтра, когда уже знаем maxQuantity
            setupFilterUI(maxQuantity, objectManager);
        })
        .catch(err => {
            console.error('Ошибка загрузки open.json:', err);
        });
});

function setupFilterUI(maxQuantity, objectManager) {
    const toggleBtn = document.getElementById('filter-toggle');
    const panel = document.getElementById('filter-panel');
    const range = document.getElementById('quantity-range');
    const input = document.getElementById('quantity-input');
    const currentValueLabel = document.getElementById('filter-current-value');

    // Проверяем наличие элементов
    if (!toggleBtn || !panel || !range || !input || !currentValueLabel) {
        console.warn('Элементы фильтра не найдены в DOM. Проверь HTML (id: filter-toggle, filter-panel, quantity-range, quantity-input, filter-current-value).');
        return;
    }

    // Явно прячем панель на старте
    panel.style.display = 'none';

    // Настройка границ ползунка и поля
    range.min = 0;
    range.max = maxQuantity || 0;
    range.value = 0;

    input.min = 0;
    input.max = maxQuantity || 0;
    input.value = 0;

    updateCurrentValueLabel(0);

    // Кнопка "Фильтр по ДК" — напрямую переключаем display
    toggleBtn.addEventListener('click', () => {
        const visibleNow = panel.style.display === 'block';
        panel.style.display = visibleNow ? 'none' : 'block';
        console.log('toggle filter panel, now:', panel.style.display);
    });

    // Ползунок -> меняем поле и фильтр
    range.addEventListener('input', () => {
        const val = parseInt(range.value, 10) || 0;
        input.value = val;
        applyFilter(val, objectManager);
        updateCurrentValueLabel(val);
    });

    // Поле ввода -> нормализуем, двигаем ползунок и фильтр
    input.addEventListener('input', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val)) val = 0;

        const min = parseInt(range.min, 10);
        const max = parseInt(range.max, 10);

        if (val < min) val = min;
        if (val > max) val = max;

        input.value = val;
        range.value = val;

        applyFilter(val, objectManager);
        updateCurrentValueLabel(val);
    });

    function updateCurrentValueLabel(minVal) {
        currentValueLabel.textContent = `Показываются точки с кол-вом ≥ ${minVal}`;
    }
}

function applyFilter(minQuantity, objectManager) {
    currentMinQuantity = minQuantity;

    if (!objectManager) return;

    objectManager.setFilter(obj => {
        const q = obj.properties && typeof obj.properties.quantity === 'number'
            ? obj.properties.quantity
            : 0;
        return q >= currentMinQuantity;
    });
}
