const balanceField = document.querySelector('#balance');
const transactionDescription = document.querySelector('#transaction-desc');
const inputAmount = document.querySelector('#transaction-amount');
const incomeField = document.querySelector('.inc-text');
const expenseField = document.querySelector('.exp-text');
const addBtn = document.querySelector('.add-transaction-button');
const list = document.querySelector('.transactions-list');
list.addEventListener("click", removeTransaction);
let item;

let idCounter;
let cash;
let liObjects = [];

let transactionInfo = {}

if (localStorage.item == undefined) {
    cash = {
        balance: 0.00,
        incomeValue: 0.00,
        expenseValue: 0.00,
    }
} else {
    cash = JSON.parse(localStorage.item);
    updateBalance();
}


console.log(liObjects);
if (localStorage.liItem !== undefined) {
    liObjects = JSON.parse(localStorage.liItem);
    console.log(liObjects);
    console.log(liObjects[liObjects.length-1].id);
    idCounter = liObjects[liObjects.length-1].id+1;
    for (ob of liObjects) {
        item = document.createElement('li');
        item.innerHTML = `${ob.description} <span data-span-id='${ob.id}' class='${ob.marker} span-delete'>${parseFloat(ob.amount)
            }  <button class="delete-btn">x</button> </span> `;
        list.appendChild(item);
    }
}else{
    idCounter = 1;
}


let sign;


addBtn.onclick = function () {
    calculate();
    updateBalance();
    writeDescription();
}

function calculate() {
    const inputTransaction = parseFloat(inputAmount.value);
    sign = inputTransaction > 0 ? true : false;
    updateBalance();

    return sign ?
        (cash.incomeValue += inputTransaction, cash.balance += inputTransaction) :
        (cash.expenseValue += inputTransaction, cash.balance += inputTransaction);

}

function updateBalance() {

    updateLocalStorage();
    return incomeField.textContent = cash.incomeValue + '₴', balanceField.textContent = cash.balance + '₴',
        expenseField.textContent = cash.expenseValue + '₴';
}

function writeDescription() {
    item = document.createElement('li');
    transactionInfo = {
        description: transactionDescription.value,
        marker: sign ? 'plus' : 'minus',
        amount: inputAmount.value,
        id: idCounter++,
    }


    item.innerHTML = `${transactionInfo.description} <span data-span-id='${transactionInfo.id}' class='${transactionInfo.marker} span-delete'>${parseFloat(transactionInfo.amount)
        }  <button class="delete-btn">x</button> </span> `;
    list.appendChild(item);


    liObjects.push(transactionInfo);
    localStorage.liItem = JSON.stringify(liObjects);
    console.log('div: ' + localStorage.liItem);


}


function removeTransaction(event) {

    if (event.target.classList.contains("delete-btn")) {


        
        liObjects.splice(Number(event.target.closest("span").dataset.spanId)-1,1);
        localStorage.liItem = JSON.stringify(liObjects);
        console.log(JSON.parse(localStorage.liItem));
        
        let amountToDelete = parseFloat(event.target.closest("span").textContent);
        event.target.closest("li").remove();

        if (event.target.closest("span").classList.contains("plus")) {
            cash.incomeValue -= amountToDelete;
        } else {
            cash.expenseValue -= amountToDelete;
        }
        cash.balance -= amountToDelete;
        updateBalance();

    }
}

function updateLocalStorage() {
    localStorage.item = JSON.stringify(cash);
}